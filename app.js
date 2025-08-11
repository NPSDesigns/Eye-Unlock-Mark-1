// app.js
const startBtn = document.getElementById('startBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const status = document.getElementById('status');
const lockedOverlay = document.getElementById('lockedOverlay');
const progressText = document.getElementById('progress');

const markers = [
  document.getElementById('corner-tl'),
  document.getElementById('corner-tr'),
  document.getElementById('corner-br'),
  document.getElementById('corner-bl')
];

const useFront = document.getElementById('useFrontCam');

let sequenceIndex = 0;
let achieved = [false, false, false, false];

const CORNER_ZONE_PCT = 0.20;
const DWELL_MS = 400;

let dwellStart = null;
let lastZone = -1;
let unlocked = false;

const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function screenZones(){
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const px = Math.round(w * CORNER_ZONE_PCT);
  const py = Math.round(h * CORNER_ZONE_PCT);
  return [
    {xMin:0, xMax:px, yMin:0, yMax:py},
    {xMin:w-px, xMax:w, yMin:0, yMax:py},
    {xMin:w-px, xMax:w, yMin:h-py, yMax:h},
    {xMin:0, xMax:px, yMin:h-py, yMax:h}
  ];
}

function drawDebug(pred){
  ctx.clearRect(0,0,canvas.clientWidth, canvas.clientHeight);
  const zones = screenZones();
  zones.forEach((z,i)=>{
    ctx.fillStyle = achieved[i] ? 'rgba(40,200,120,0.12)' : 'rgba(255,255,255,0.02)';
    ctx.strokeStyle = achieved[i] ? 'rgba(40,200,120,0.25)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.fillRect(z.xMin, z.yMin, z.xMax - z.xMin, z.yMax - z.yMin);
    ctx.strokeRect(z.xMin + 0.5, z.yMin + 0.5, z.xMax - z.xMin, z.yMax - z.yMin);
  });

  if(pred){
    ctx.beginPath();
    ctx.arc(pred.x, pred.y, 10, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(43,124,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function refreshMarkers(){
  markers.forEach((m,i)=> {
    if (i === sequenceIndex) m.classList.add('active'); else m.classList.remove('active');
    if (achieved[i]) m.style.opacity = '0.6'; else m.style.opacity = '1';
  });
  progressText.textContent = `Progress: ${achieved.filter(Boolean).length} / 4`;
}

function onUnlock(){
  unlocked = true;
  status.textContent = 'Unlocked! Redirecting...';
  lockedOverlay.classList.add('hidden');
  setTimeout(()=> {
    window.location.href = 'https://example.com';
  }, 750);
}

async function ensureFrontCamera(){
  try{
    const constraints = {video: { facingMode: useFront.checked ? "user" : "environment"}};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(t=>t.stop());
    return true;
  }catch(err){
    console.warn('camera request failed', err);
    return false;
  }
}

async function startWebGazerFlow(){
  status.textContent = 'Preparing camera and tracker...';
  const ok = await ensureFrontCamera();
  if(!ok){
    status.textContent = 'Camera access failed. Allow camera and reload.';
    return;
  }

  webgazer.setRegression('ridge')
          .setTracker('clmtrackr')
          .setGazeListener(gazeListener)
          .begin()
          .showPredictionPoints(false);

  const wgVideo = document.getElementById('webgazerVideoFeed');
  if(wgVideo) wgVideo.style.display = 'none';

  lockedOverlay.classList.remove('hidden');
  status.textContent = 'Started. Align face and follow the corners.';
  sequenceIndex = 0;
  achieved = [false,false,false,false];
  dwellStart = null;
  lastZone = -1;
  refreshMarkers();

  (function anim(){
    if(unlocked) return;
    const pred = webgazer.getCurrentPrediction();
    drawDebug(pred);
    requestAnimationFrame(anim);
  })();
}

function gazeListener(data, elapsedTime){
  if(!data || unlocked) return;
  const x = data.x;
  const y = data.y;
  const zones = screenZones();

  let zoneIndex = -1;
  for(let i=0;i<zones.length;i++){
    const z = zones[i];
    if(x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax){
      zoneIndex = i; break;
    }
  }

  if(zoneIndex === sequenceIndex){
    if(lastZone !== zoneIndex){
      dwellStart = performance.now();
      lastZone = zoneIndex;
    } else {
      const now = performance.now();
      if(dwellStart && (now - dwellStart) >= DWELL_MS){
        achieved[zoneIndex] = true;
        sequenceIndex = Math.min(sequenceIndex + 1, 3);
        lastZone = -1;
        dwellStart = null;
        refreshMarkers();
        if(achieved.every(Boolean)){
          onUnlock();
        }
      }
    }
  } else {
    dwellStart = null;
    lastZone = zoneIndex;
  }
}

function quickCalibrate(){
  alert('Quick calibration: look at the four white dots on screen for a second each when they appear.');
  const calibSteps = [
    {x:60, y:60}, {x:window.innerWidth - 60, y:60},
    {x:window.innerWidth - 60, y:window.innerHeight - 60}, {x:60, y:window.innerHeight - 60}
  ];

  let i=0;
  const show = () => {
    const el = document.createElement('div');
    el.style.position='fixed';
    el.style.left=(calibSteps[i].x - 12)+'px';
    el.style.top=(calibSteps[i].y - 12)+'px';
    el.style.width='24px'; el.style.height='24px';
    el.style.borderRadius='12px'; el.style.background='white';
    el.style.zIndex=99999;
    document.body.appendChild(el);
    setTimeout(()=>{ document.body.removeChild(el); i++; if(i<calibSteps.length) show(); }, 700);
  };
  show();
}

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  startWebGazerFlow();
});
calibrateBtn.addEventListener('click', quickCalibrate);

status.textContent = 'Ready. Tap "Start Eye Unlock".';
refreshMarkers();
