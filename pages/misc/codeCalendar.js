const CODE_CALENDAR_WRAPPER = document.querySelector(".code-calendar");
const PROJECTS = [
    "this calendar; barcode generator", "barcode generator (first main section)", "new ambient scene??", "barcode generator again...", "lost souls (what the new ambient scene becomes)", "like barely even 10 lines of code", "ambient thingy visuals",
    "REFACTORINGGGGG", "more ambient stuff...", "", "", "piecing together like 3 seperate projects into one", "ESS database config & linux stuff", "",
    "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
    "", "",
]
const GOOD_SOUND_URLS = [
    "https://media.murrayrobertsonmusic.com/coding-calendar/good_one.mp3",
    "https://media.murrayrobertsonmusic.com/coding-calendar/good_two.mp3",
    "https://media.murrayrobertsonmusic.com/coding-calendar/good_three.mp3",
    "https://media.murrayrobertsonmusic.com/coding-calendar/good_four.mp3",
    "https://media.murrayrobertsonmusic.com/coding-calendar/good_five.mp3",
]
const BAD_SOUND_URLS = [
    "https://media.murrayrobertsonmusic.com/coding-calendar/bad_one.mp3",
    "https://media.murrayrobertsonmusic.com/coding-calendar/bad_two.mp3"
]

let GOOD_SOUND_BUFFERS = [];
let BAD_SOUND_BUFFERS = [];

let cells = [];

//create audio context FIRST
let context = new AudioContext();
loadAll();
const gainDown = new GainNode(context);
gainDown.gain.setValueAtTime(0.1, context.currentTime);
gainDown.connect(context.destination);

//create all the cells
for (let i = 0; i < 30; i++) {
    const cell = document.createElement("span");
    cell.classList.add("code-calendar__cell");

    const row = String(Math.floor(i / 7 + 1));
    const col = String(i % 7 + 1);
    cell.style.gridColumn = col;
    cell.style.gridRow = row

    cell.innerText = String(i + 1);

    if (PROJECTS[i]) {
        cell.classList.add("code-calendar__cell--completed")
    }

    const _enlarge = () => {
        if (context.state === "suspended") context.resume();
        cell.innerText = `${i+1}: ${PROJECTS[i]}`;
        cell.classList.add("code-calendar__cell--enlarged");
        playSound(PROJECTS[i] !== "" ? true : false);
    }
    const _shrink = () => {
        cell.innerText = String(i + 1);
        cell.classList.remove("code-calendar__cell--enlarged");
    }

    cell.addEventListener("pointerenter", _enlarge);
    cell.addEventListener("pointerleave", _shrink);

    cells.push(cell);
    CODE_CALENDAR_WRAPPER.appendChild(cell);
}

//create the title in the bottom corner
const title = document.createElement("span");
title.classList.add("code-calendar__title");

let completedCount = 0;
for (const day of PROJECTS) {
    if (day) completedCount++;
}
title.innerText = `Coding Everyday in November: ${completedCount}/30`;

title.addEventListener("pointerenter", () => {
    title.classList.add("code-calendar__title--enlarged");
    title.innerText = 
        `This is a personal challenge to code every day in November. I've coded ${completedCount} days so far. We'll see if I make it to the end... stay tuned for the end result!! (hover over the days to see what project(s) I was working on that day)`;
})

title.addEventListener("pointerleave", () => {
    title.classList.remove("code-calendar__title--enlarged");
    title.innerText = `Coding Everyday in November: ${completedCount}/30`;
})

CODE_CALENDAR_WRAPPER.appendChild(title);

//define how to play a sound
function playSound(good = true) {
    const buffer = pickRandomFrom(good ? GOOD_SOUND_BUFFERS : BAD_SOUND_BUFFERS);
    const bufferNode = new AudioBufferSourceNode(context, {
        "buffer": buffer,
    })
    
    bufferNode.connect(gainDown);
    bufferNode.start(context.currentTime);
    console.log(`Playing`)
}

//load all 7 sounds
async function loadAll() {
    [GOOD_SOUND_BUFFERS, BAD_SOUND_BUFFERS] = await Promise.all([
        Promise.all(GOOD_SOUND_URLS.map(url => loadAudioBuffer(context, url))),
        Promise.all(BAD_SOUND_URLS.map(url => loadAudioBuffer(context, url))),
    ]);
}


//helpers
async function loadAudioBuffer(audioContext, url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

function pickRandomFrom(list) {
    const index = Math.floor(Math.random() * list.length);
    return list[index];
}