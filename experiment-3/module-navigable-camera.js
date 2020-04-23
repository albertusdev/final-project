// Detecting scroll movement

let scrollDetector;
let scrollInitial;

function initNavigableCamera() {
  
  scrollDetector = document.querySelector('#scroll-detector > *')
  scrollDetector.scrollTop = scrollDetector.clientHeight / 2;
  scrollInitial = scrollDetector.scrollTop;
  scrollDetector.addEventListener('scroll', zoomCameraFromScrollDetector)

  scrollDetector.addEventListener('mousedown', startTrackball)
  document.addEventListener('mousemove', trackMouseForTrackball)
  document.addEventListener('mouseup', stopTrackball)

  scrollDetector.addEventListener('touchstart', startTrackballOnDevice)
  document.addEventListener('touchmove', trackMouseForTrackballOnDevice)
  document.addEventListener('touchend', stopTrackballOnDevice)
  
  scrollDetector.parentElement.addEventListener('keydown', processCanvasArrowKeydown)
}

/**
 * Convert keyboard into directions: "LEFT", "RIGHT", "UP", and "DOWN".
 *
 * @param {Event} event
 */

function convertKeyboardIntoDirection(event) {
  let direction = '';
  let whichToDirection = {
    37: 'LEFT',
    38: 'UP',
    39: 'RIGHT',
    40: 'DOWN',
  };
  if (event.code) {
    // Remove 'Arrow' token in the string
    direction = event.code.replace('Arrow', '');
  } else if (event.key) {
    direction = event.code.replace('Arrow', '');
  } else {
    direction = whichToDirection[event.which] || '';
  }

  if (direction.length > 0) {
    direction = direction.toUpperCase();
    if (coordinateDirectionOrder.indexOf(direction) >= 0) {
      return direction;
    }
  }
}

/**
 * Process canvas keydown event. If arrow key is pressed,
 * it will later be transformed into next camera position
 * accoding to `cameraMovementCoordinates`.
 *
 * @param {Event} event
 */

function processCanvasArrowKeydown(event) {
  let direction = convertKeyboardIntoDirection(event);
  if (!direction) {
    return;
  }

  let directionIdx = coordinateDirectionOrder.indexOf(direction);
  let newAllowedCoords = cameraMovementCoordinates[cameraPosIndex];
  let newCameraPosIdx = newAllowedCoords[directionIdx];
  if (newCameraPosIdx < 0) {
    return;
  }

  cameraPosIndex = newCameraPosIdx;

  let cameraPosCoords = cameraCoordinates[cameraPosIndex];
  let cameraSpherePos = cartesianToSphere(
    cameraPosCoords[0],
    -cameraPosCoords[2],
    cameraPosCoords[1]
  );
  let new_phi = cameraSpherePos[1];
  let new_theta = cameraSpherePos[2];

  phi = new_phi;
  theta = new_theta;
  updateViewMatrix();
}

/** Capture scroll movement and translate it into sphere radius coordinate
 * or distance from origin to camera. The radius is capped between near & far
 * values.
 */

function zoomCameraFromScrollDetector () {
  let deltaScroll = scrollDetector.scrollTop - scrollInitial;
  scrollDetector.scrollTop = scrollInitial;
  let newRadius = Math.pow(Math.E, Math.log(camera.radius) + deltaScroll / 10);
  if (newRadius < camera.near) {
    return
  }
  if (newRadius > camera.far) {
    return;
  }
  camera.radius = newRadius;
  updateViewMatrix();
}

// Implement trackball using sphere coordinate.
// Source: https://computergraphics.stackexchange.com/questions/151/how-to-implement-a-trackball-in-opengl

let isClickingForTrackball = false;

let posXInit = 0;
let posYInit = 0;
let initPhi;
let initTheta;
let initCameraPos = [0, 0, 0];
let initLook = [];
let initCameraRight = [];
let initCameraUp = [];
let isCameraPositionTrackballed = false;

function startTrackball(event) {
  if (isClickingForTrackball) {
    return
  }
  posXInit = event.screenX || event.touches[0].screenX;
  posYInit = event.screenY || event.touches[0].screenY;
  initPhi = phi;
  initTheta = theta;

  initCameraPos = sphereToCartesian(camera.radius, initPhi, initTheta);
  initLook = normalize(initCameraPos)
  initCameraRight = cross(initLook, up);
  initCameraUp = cross(initLook, initCameraRight)

  isClickingForTrackball = true;
}

function trackMouseForTrackball(event) {
  if (!isClickingForTrackball) {
    return
  }

  let deltaX = event.screenX || event.touches[0].screenX - posXInit;
  let deltaY = event.screenY || event.touches[0].screenY - posYInit;

  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
    return
  }

  deltaX = deltaX / window.innerWidth * 2;
  deltaY = -deltaY / window.innerHeight * 2;

  let cameraPos = add(initCameraPos, scale(deltaX, initCameraRight))
  cameraPos = add(cameraPos, scale(deltaY, initCameraUp))
  let cameraPosInSphere = cartesianToSphere(cameraPos[0], cameraPos[1], cameraPos[2])

  phi = initPhi + -deltaX * 3
  let newTheta = initTheta + deltaY * 3;
  if (Math.abs(newTheta) < 0.1 || Math.sign(newTheta) !== Math.sign(initTheta)) {
    newTheta = (Math.sign(initTheta) || 1) * 0.1;
    initTheta = newTheta;
    posYInit = event.screenY;
  } else if (Math.abs(newTheta) > Math.PI - 0.1 || Math.sign(newTheta) !== Math.sign(initTheta)) {
    newTheta = (Math.sign(initTheta) || 1) * (Math.PI - 0.1);
    initTheta = newTheta;
    posYInit = event.screenY;
  }
  theta = newTheta;

  // theta = Math.sign(theta) * Math.max(Math.abs(theta), 0.1)

  if (!isCameraPositionTrackballed) {
    isCameraPositionTrackballed = true
  }

  updateViewMatrix();

  // Clear selection
  // Taken from: https://stackoverflow.com/a/3169849/10159381

  if (window.getSelection) {
    if (window.getSelection().empty) {
      window.getSelection().empty();
    } else if (window.getSelection().removeAllRanges) {
      window.getSelection().removeAllRanges();
    }
  } else if (document.selection) {
    document.selection.empty();
  }
}

function stopTrackball() {
  if (!isClickingForTrackball) {
    return
  }
  isClickingForTrackball = false;
}

function startTrackballOnDevice(event) {
  event.preventDefault()
  startTrackball(event)
}

function trackMouseForTrackballOnDevice(event) {
  trackMouseForTrackball(event)
}

function stopTrackballOnDevice(event) {
  stopTrackball(event)
}