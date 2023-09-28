window.AudioContext = window.AudioContext || window.webkitAudioContext;
var alreadyStarted = false;
var isPlaying = false;
var audioContext,
  sourceNode,
  analyser,
  theBuffer,
  DEBUGCANVAS,
  mediaStreamSource = null;
var rafID,
  tracks = null;

var detectorElem,
  canvasElem,
  waveCanvas,
  pitchElem,
  noteElem,
  detuneElem,
  detuneAmount;
var newcanvas;
var buflen = 2048;
var buf = new Float32Array(buflen);
let maxHeight = 400; // in hz

const historyLength = 500; // Number of history dots
const dotRadius = 5; // Radius of the black dot
const trailDotRadius = 5; // Radius of the trail dots
const trailSpacing = 5; // Spacing between trail dots
const sprite = new Image();
var noteStrings = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

let history = []; // Array to store history of dot positions

const frequencies = {
  c2: 65.41,
  d2: 73.42,
  e2: 82.41,
  f2: 87.31,
  g2: 98.0,
  a2: 110.0,
  b2: 123.47,
  c3: 130.81,
  d3: 146.83,
  e3: 164.81,
  f3: 174.61,
  g3: 196.0,
  a3: 220.0,
  b3: 246.94,
  c4: 261.63,
  d4: 293.66,
  e4: 329.63,
  f4: 349.23,
  g4: 392.0,
  a4: 440.0,
  b4: 493.88,
  c5: 523.25,
  d5: 587.33,
  e5: 659.25,
  f5: 698.46,
  g5: 783.99,
  a5: 880.0,
  b5: 987.77,
  c6: 1046.5,
  d6: 1174.66,
  e6: 1318.51,
  f6: 1396.91,
  g6: 1567.98,
  a6: 1760.0,
  b6: 1975.53,
};

function noteFromPitch(frequency) {
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  let r = Math.round(noteNum) + 69;
  return r;
}

function frequencyFromNoteNumber(note) {
  let r = 440 * Math.pow(2, (note - 69) / 12);
  return r;
}

function centsOffFromPitch(frequency, note) {
  return Math.floor(
    (1200 * Math.log(frequency / frequencyFromNoteNumber(note))) / Math.log(2)
  );
}

function autoCorrelate(buf, sampleRate) {
  // Copyright (c) 2014 Chris Wilson
  // Implements the ACF2+ algorithm
  var SIZE = buf.length;
  var rms = 0;

  for (var i = 0; i < SIZE; i++) {
    var val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005)
    // not enough signal
    return -1;

  var r1 = 0,
    r2 = SIZE - 1,
    thres = 0.2;
  for (var i = 0; i < SIZE / 2; i++)
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  for (var i = 1; i < SIZE / 2; i++)
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }

  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  var c = new Array(SIZE).fill(0);
  for (var i = 0; i < SIZE; i++)
    for (var j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];

  var d = 0;
  while (c[d] > c[d + 1]) d++;
  var maxval = -1,
    maxpos = -1;
  for (var i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  var T0 = maxpos;

  var x1 = c[T0 - 1],
    x2 = c[T0],
    x3 = c[T0 + 1];
  a = (x1 + x3 - 2 * x2) / 2;
  b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

/////////////////////////////////////////////////////////////////////////////
function updatePitch(time) {
  var cycles = new Array();
  analyser.getFloatTimeDomainData(buf);

  var ac = autoCorrelate(buf, audioContext.sampleRate);

  if (ac == -1) {
    // do nothing, so keep the canvas moving
    // detectorElem.className = "vague";
    pitchElem.innerText = "";
    noteElem.innerText = "-";
    detuneElem.className = "";
    detuneAmount.innerText = "no cents";

    updateCanvasWithPitch(0);
  } else {

    detectorElem.className = "confident";
    pitch = ac;

    var note = noteFromPitch(pitch);
    updateCanvasWithPitch(Math.round(pitch), noteStrings[note % 12]);
    noteElem.innerHTML = noteStrings[note % 12];
    var detune = centsOffFromPitch(pitch, note);

    if (detune == 0) {
      detuneElem.className = "";
      detuneAmount.innerHTML = "--";
    } else {
      if (detune < 0) detuneElem.className = "flat";
      else detuneElem.className = "sharp";
      detuneAmount.innerHTML = Math.abs(detune);
    }
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = window.webkitRequestAnimationFrame;
  rafID = window.requestAnimationFrame(updatePitch);
}

function drawHorizontalLines(pitch) {
  const canvas = document.getElementById("newCanvas");
  const ctx = canvas.getContext("2d");

  const frequencies = [
    { note: "C2", frequency: 65.4 },
    { note: "C3", frequency: 130.81 },
    { note: "C4", frequency: 261.63 },
    { note: "C5", frequency: 261.63 * 2 },
    { note: "C6", frequency: 261.63 * 4 },
  ];

  ctx.strokeStyle = "lightblue";
  ctx.lineWidth = 1;
  ctx.font = "bold 30px Arial";
  pitch = pitch ? Math.round(pitch, 2) : "";

  // Calculate the Y positions based on frequencies and canvas height
  const yPositions = frequencies.map(({ frequency }) => {
    return canvas.height - (frequency / maxHeight) * canvas.height;
  });

  // Draw the horizontal lines
  ctx.beginPath();
  yPositions.forEach((y) => {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  });
  ctx.stroke();

  // Draw text labels
  ctx.font = "25px Arial";
  frequencies.forEach(({ note }, index) => {
    ctx.fillText(note, 20, yPositions[index] - 5);
  });
}




function starting() {
  // Retrieve the canvas element
  const canvas = document.getElementById('newCanvas');

  // Get the 2D rendering context
  const ctx = canvas.getContext('2d');

  // Set the font properties
  ctx.font = '31px Futura';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';

  // Set the initial message
  let message = 'Click and start singing';

  // Draw the message on the canvas
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);

  // Add a click event listener to the canvas
  canvas.addEventListener('click', function() {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update the message or perform any other actions
    message = 'Go!!!';

    // Draw the updated message on the canvas
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  });
}

// Execute the starting() function when the DOM content is loaded
document.addEventListener('DOMContentLoaded', starting);


window.onload = function () {
  audioContext = new AudioContext();
  MAX_SIZE = Math.max(4, Math.floor(audioContext.sampleRate / 1500)); // corresponds to a 5kHz signal

  // html elements
  detectorElem = document.getElementById("detector");
  canvasElem = document.getElementById("output");
  newCanvas = document.getElementById("newCanvas");
  pitchElem = document.getElementById("pitch");
  noteElem = document.getElementById("note");
  detuneElem = document.getElementById("detune");
  detuneAmount = document.getElementById("detune_amt");
};

/////////////////////
// this executes when the canvas is clicked

function startPitchDetect() {
  if (alreadyStarted) return;
  alreadyStarted = true;
  audioContext = new AudioContext();
  navigator.mediaDevices
    .getUserMedia({
      audio: {
        mandatory: {
          googEchoCancellation: "false",
          googAutoGainControl: "false",
          googNoiseSuppression: "false",
          googHighpassFilter: "false",
        },
        optional: [],
      },
    })
    .then((stream) => {
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048 * 1; // this increases resolution
      mediaStreamSource.connect(analyser);
      updatePitch();
    })
    .catch((err) => {
      alert(`Microphone failed ${err.name}: ${err.message}`);
    });

  // playAudio();

}

function calculateYPosition(frequency) {
  let top = 20000;
  let bottom = 20;
  const normalizedY = (frequency - bottom) / (top - bottom);
  return normalizedY;
}

function updateCanvasWithPitch(pitch, note) {
  const canvas = document.getElementById("newCanvas");
  const ctx = canvas.getContext("2d");

  let y = (1 - pitch / maxHeight) * canvas.height;


  // Add current position to the history array
  history.unshift({ x: canvas.width - dotRadius, y: y });

  // Trim the history array to historyLength
  if (history.length > historyLength) history.pop();

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // drawHorizontalLines();





  if (y == 600) {
    // console.log('bad');
  } else {
    const circleRadius = 30;
    const circleX = canvas.width - dotRadius - circleRadius; // Adjust the horizontal position as needed
    const circleY = y - circleRadius - 5; // Adjust the vertical position as needed

    // Draw the circle
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleRadius, 0, 2 * Math.PI);
    // ctx.stroke();

    // Draw the pitch text inside the circle
    // debugger;
    let pitchText = note + " " + Math.round(y,0)  ; // Format the frequency value as desired


    ctx.fillStyle = "white";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    // if (pitchText === undefined) pitchText = "";
    ctx.fillText(pitchText, circleX-100, circleY + 4); // Adjust the vertical position of the text as needed
  }
  // draw the history dots
  for (let i = 1; i < history.length; i++) {
    let currentDot = history[i];
    let previousDot = history[i - 1];
    let currentXPos = currentDot.x - trailSpacing * i;
    let previousXPos = previousDot.x - trailSpacing * (i - 1);

    let distance = Math.abs(currentDot.y - previousDot.y);


    let soundAudible = currentDot.y != canvas.height ? true : false;
    let distanceBetweenPoints = distance <= 50;
    if (distanceBetweenPoints && soundAudible) {
      ctx.beginPath();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 5; // Set line thickness to 2 pixels
      ctx.moveTo(previousXPos, previousDot.y);
      ctx.lineTo(currentXPos, currentDot.y);
      ctx.stroke();
    }
  }
}
