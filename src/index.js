"use strict";

let sceneGraph
let animationManager

// Camera variables

let camera = {
  near: 0.05,
  far: 20.0,
  radius: 8,
  fovy: 55.0,
  aspect: 1.0,
  viewMatrix: m4.identity(),
  projectionMatrix: m4.identity()
}

let theta = 0
let phi = 0
let cameraPosIndex = 17
let coordinateDirectionOrder = ['UP', 'LEFT', 'DOWN', 'RIGHT']

let at = vec3(0.0, 0.0, 0.0)
let up = vec3(0.0, 0.0, 1.0)

// rendering engine variables variables

let canvas
let gl
let program
let resolution = 100

// Interaction variables

let isMenuShown = true
let sliderList = []



// Utility to update slider value

/**
 * Update slider display from parent element
 * 
 * @param {[String, HTMLInputElement]} slider 
 */

function updateSliderDisplay(slider, value) {
  if (typeof slider === 'string') {
    slider = document.querySelector(`input[name="${slider}"`)
  }
  if (typeof value == 'undefined') {
    value = parseFloat(slider.value);
  }
  if (slider) {
    slider.parentElement.querySelector('.slider-value').innerText = value;
  }
}

/**
 * Update slider value and its display
 * 
 * @param {[String, HTMLInputElement]} slider 
 * @param {Number} value 
 * @param {Number} sliderValue optional, different value for slider
 */

function updateSliderValueAndDisplay(slider, value, sliderValue) {
  if (value) {
    if (typeof slider === 'string') {
      slider = document.querySelector(`input[name="${slider}"`)      
    }
    if (typeof sliderValue === 'undefined') {
      sliderValue = value;
    }
    if (slider) {
      slider.value = sliderValue;
      slider.parentElement.querySelector('.slider-value').innerText = value;
    }
  }
}

/**
 * Function to update animation slider that has been throttled
 * so that it's not executed too often.
 */
let throttledSliderHandler = function () {}

function initCanvasAndGL() {
  canvas = document.getElementById('gl-canvas');

  gl = WebGLUtils.setupWebGL(canvas);
  if (!gl) {
    alert("WebGL isn't available");
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.2, 0.2, 0.2, 1.0);

  gl.enable(gl.DEPTH_TEST);
  program = initShaders(gl, 'vertex-shader', 'fragment-shader');
  gl.useProgram(program);
}

/**
 * Initialize camera position from chosen camera position index
 */

function initializeCameraPosition() {
  let cameraPosCoords = cameraCoordinates[cameraPosIndex];
  // Match camera coordinate (Y+ axis pointing up) to Blender's.
  // (Z+ pointing up)
  let cameraSpherePos = cartesianToSphere(
    cameraPosCoords[0],
    -cameraPosCoords[2],
    cameraPosCoords[1]
  );
  phi = cameraSpherePos[1];
  theta = cameraSpherePos[2];
}

function initializeProjectionMatrix() {
  camera.projectionMatrix = perspective(camera.fovy, camera.aspect, camera.near, camera.far)
  let matrixGlLocation = sceneGraph.glLocations.projectionMatrix
  gl.uniformMatrix4fv(matrixGlLocation, false, flatten(camera.projectionMatrix))
}

function toggleAnimation() {
  const animateBtn = document.getElementById('btn-animate');
  if (animationManager.isAnimating) {
    animationManager.stopAnimation()
    animateBtn.innerText = 'Mulai Animasi';
    animateBtn.classList.remove('btn-danger');
    animateBtn.classList.add('btn-primary');
    document.querySelectorAll('.range-animation')
      .forEach(elem => {
        elem.disabled = false;
      })
  } else {
    animationManager.startAnimation();
    animateBtn.innerText = 'Hentikan Animasi';
    animateBtn.classList.remove('btn-primary');
    animateBtn.classList.add('btn-danger');
    document.querySelectorAll('.range-animation')
      .forEach(elem => {
        elem.disabled = true;
      })
  }
}

function connectSlidersToModelData() {
  document.querySelectorAll('input[type="range"]').forEach(elem => {
    const sliderName = elem.getAttribute('name')
    const propertyData = parsePropertyString(sliderName);
    if (propertyData === undefined) {
      return
    }

    const { modelName, propertyName, axisId } = propertyData;
    let node = sceneGraph.nodes[modelName];
    let modelProperties = node.model[propertyName];

    elem.addEventListener('input', () => {
      let value = parseFloat(elem.value);
      updateSliderValueAndDisplay(elem, value);
      modelProperties[axisId] = value;
      node.updateTransformations();
    })
  })
}

function connectSpeedSlider() {
  let slider = document.querySelector('input[name="speed"]');

  const SPEED_MIN = parseFloat(slider.getAttribute('min'));
  const SPEED_MAX = parseFloat(slider.getAttribute('max'));

  slider.addEventListener('input', () => {
    let value = parseFloat(slider.value);
    value = interpolateExponentially(SPEED_MIN, SPEED_MAX, value);
    updateSliderDisplay(slider, Math.round(value * 100) + '%');
    animationManager.speed = value;
  })

  // Init slider position from inverse of exponential (logarithm)
  let currentSpeed = animationManager.speed;
  let displaySpeed = Math.round(currentSpeed * 100) + '%'
  let sliderInitValue = interpolateLogarithmatically(SPEED_MIN, SPEED_MAX, currentSpeed);
  
  updateSliderValueAndDisplay(slider, displaySpeed, sliderInitValue);
}

function connectLightPositionSliders() {
  document.querySelectorAll('input[name^=light-position]').forEach(slider => {

    const name = slider.getAttribute('name');
    const axisName = name.match(/light-position-(x|y|z)$/)[1];
    const axisId = ['x', 'y', 'z'].indexOf(axisName);

    let value = lightingCubeModel.location[axisId];
    updateSliderValueAndDisplay(slider, value)

    slider.addEventListener('input', () => {
      let value = parseFloat(slider.value);

      lightingCubeModel.location[axisId] = value;
      lightingCubeModel.updateMatrices();

      sceneGraph.updateLightSetup({position: lightingCubeModel.location});
      sceneGraph.updateGlLightPosition();

      updateSliderDisplay(slider, value);

      // Update selected slider as well

      if (sceneGraph.selectedNodeName === 'cube-lighting') {
        updateSliderValueAndDisplay(`selected-object-location-${axisName}`, value)
      }
    });

    // Hook selected object slider
    
    let selectedSlider = document.querySelector(`input[name="selected-object-location-${axisName}"]`)
    if (selectedSlider) {
      selectedSlider.addEventListener('input', function() {
        if (sceneGraph.selectedNodeName === 'cube-lighting') {
          updateSliderValueAndDisplay(slider, parseFloat(selectedSlider.value))
        }
      })
    }
  });
}

/**
 * Update eye coordinate calculation from global
 * variables `radius`, `theta`, and `phi`.
 */

function updateViewMatrix() {
  let r = camera.radius;
  
  theta = (Math.sign(theta) || 1) * Math.max(Math.abs(theta), 0.1)
  
  let sin_t = Math.sin(theta);
  let sin_p = Math.sin(phi);
  let cos_t = Math.cos(theta);
  let cos_p = Math.cos(phi);

  let x = r * sin_t * cos_p;
  let y = r * sin_t * sin_p;
  let z = r * cos_t;

  let eye = add(at, vec3(x, y, z));

  camera.viewMatrix = flatten(lookAt(eye, at, up));
  gl.uniformMatrix4fv(sceneGraph.glLocations.viewMatrix, false, flatten(camera.viewMatrix));
}

let isSpaceKeyPressed = false

function handleSpaceKeydown(event) {
  if (isSpaceKeyPressed) {
    return
  }
  if (event.code === 'Space' || event.key === ' ' || event.keyCode === 32) {
    toggleAnimation()
    isSpaceKeyPressed = true
  }
}

function handleSpaceKeyup(event) {
  if (!isSpaceKeyPressed) {
    return
  }
  if (event.code === 'Space' || event.key === ' ' || event.keyCode === 32) {
    isSpaceKeyPressed = false
  }
}

let MAX_HEIGHT = 1080
let MAX_WIDTH = 1440

/**
 * Adjust viewport so the canvas stays clear even if window resolution changes.
 */

function adjustViewport() {
  let rect = canvas.parentElement.getBoundingClientRect()
  let width = rect.width * window.devicePixelRatio;
  let height = rect.height * window.devicePixelRatio;

  // Get w:h ratio of canvas size as displayed in the screen.
  let widthToHeightRatio = rect.width / rect.height;

  // Limit width and height resolution to MAX_HEIGHT and MAX_WIDTH,
  // while at the same time maintaining the w:h ratio.

  width = Math.min(MAX_WIDTH, width);
  height = Math.min(MAX_HEIGHT, width / widthToHeightRatio) * resolution / 100;
  width = Math.round(height * widthToHeightRatio);
  height = Math.round(height);

  canvas.width = width;
  canvas.height = height;

  camera.aspect = width / height;
  initializeProjectionMatrix()

  gl.viewport(0, 0, width, height);
}

function adjustResolution(event) {
  let slider = event.target
  resolution = Math.min(100, Math.max(1, slider.value))
  updateSliderDisplay(slider, resolution + '%')
  adjustViewport()
}

function toggleMenu() {
  let wrapperDOM = document.getElementById('menu-toggler-wrapper');
  let menuTogglerButtonText = document.querySelector('#menu-toggler-button > .button-text');
  if (!isMenuShown) {
    wrapperDOM.className = 'show-menu';
    menuTogglerButtonText.innerText = 'Tutup';
  } else {
    wrapperDOM.className = 'hide-menu';
    menuTogglerButtonText.innerText = 'Buka Menu';
  }
  isMenuShown = !isMenuShown;
}

/**
 * List all sliders in the document and for each slider,
 * see if the slider is in the animation dictionary and is actually
 * defined in the sceneGraph nodes.
 */

function listCustomSliders() {
  let listName = []

  document.querySelectorAll('input[type="range"]')
    .forEach(elem => {
      const sliderName = elem.getAttribute('name')
      const data = parsePropertyString(sliderName)

      if (!data) {
        return
      }

      const {
        modelName,
        propertyName,
        axisId
      } = data
      if (!sceneGraph.nodes.hasOwnProperty(modelName)) {
        return
      }

      listName.push({
        sliderName,
        modelName,
        propertyName,
        axisId
      });
    })

  return listName;
}

function attachListenerOnAnimationUpdate() {
  // Throttle update animation slider so that it gets called
  // at most 25 fps.
  sliderList = listCustomSliders()
  throttledSliderHandler = throttle(matchSlidersToAnimation, 50)
  animationManager.addListener('animationupdate', throttledSliderHandler)
}

function matchSlidersToAnimation() {
  sliderList.forEach(({
    sliderName,
    modelName,
    propertyName,
    axisId
  }) => {
    let animationValue = sceneGraph.nodes[modelName].model[propertyName][axisId]
    animationValue = Math.round(animationValue * 100) / 100
    updateSliderValueAndDisplay(sliderName, animationValue)
  })
}

let lightingCubeModel

function createCubeLight() {
  let cube_objects = {
    "vertices": [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, 0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5]
    ],
    "indices": [
      [0, 1, 3, 2],
      [2, 3, 7, 6],
      [6, 7, 5, 4],
      [4, 5, 1, 0],
      [2, 6, 4, 0],
      [7, 3, 1, 5]
    ],
    "material_name": "white"
  }

  lightingCubeModel = new Model({
    name: 'cube-lighting',
    scale: [0.2, 0.2, 0.2],
    location: [-1.4, -1.65, 1.45]
  })

  lightingCubeModel.vertices = cube_objects.vertices
  lightingCubeModel.indices = cube_objects.indices
  lightingCubeModel.setMaterial('white', sceneGraph.materials)

  sceneGraph.addModelToScene(lightingCubeModel)
}


window.addEventListener('load', function init() {
  // Initialize canvas and GL first

  initCanvasAndGL()

  // Initialize scene graph and model data from:
  // - coordinates of vertices specified in objects-vertices.js
  // - object position, rotation, and scale info in objects-data.js
  // - materials from objects-materials.js

  sceneGraph = new SceneGraph({gl, camera})
  sceneGraph.initWebGLVariables()

  sceneGraph.initMaterialsFromConfig(materials_definition)
  sceneGraph.initModelsFromConfig({
    modelsVerticesData: objects_vertices, // this is a variable inside objects-vertices.js
    modelsInfoData: objects_info // this is a variable inside objects-data.js
  })

  createCubeLight()

  sceneGraph.movePointsToBufferData()
  sceneGraph.updateModelsTransformations()

  sceneGraph.updateLightSetup({
    position: lightingCubeModel.location
  })
  sceneGraph.updateGlLightPosition()

  animationManager = new AnimationManager({
    sceneGraph,
    speed: 0.5,
    maxFrameNumber: 120
  })
  animationManager.initFromConfig(animations_definition)

  initializeCameraPosition()
  initializeProjectionMatrix()
  updateViewMatrix()

  // Attach event listener handles

  canvas.parentElement.addEventListener('keydown', handleSpaceKeydown)
  canvas.parentElement.addEventListener('keyup', handleSpaceKeyup)
  window.addEventListener('resize', adjustViewport)

  document.querySelector('#menu-toggler-button').addEventListener('click', toggleMenu)
  document.querySelector('input[name="resolution"]').addEventListener('input', adjustResolution)
  document.querySelector('#btn-animate').addEventListener('click', toggleAnimation)

  connectSlidersToModelData()
  connectSpeedSlider()
  connectLightPositionSliders()
  attachListenerOnAnimationUpdate()

  if (typeof initObjectSelectionMechanism !== 'undefined') {
    initObjectSelectionMechanism()
  }

  if (typeof initNavigableCamera !== 'undefined') {
    initNavigableCamera()
  }

  // Set focus to canvas from the start
  canvas.focus()

  adjustViewport()
  render()
})

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  Renderer.render(sceneGraph)
  window.requestAnimationFrame(render)
}