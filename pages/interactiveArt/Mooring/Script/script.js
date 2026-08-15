import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js'
import RegionsPlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.esm.js'

async function setup() {
    //copy by hand as much of the template setup as you think you need - check

    const patchExportURL = 'export/patch.export.json';

    loadingAnimations("loading", "creating web audio context");
    //create audio context
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext;

    //create gain node and connect it to audio outs
    const outputNode = context.createGain();
    outputNode.connect(context.destination);

    loadingAnimations("loading.", "fetching the RNBO patch");
    //fetch the patch
    let response, patcher;
    try {
        response = await fetch(patchExportURL);
        patcher = await response.json();

        if (!window.RNBO) {
            //loading the RNBO script
            await loadRNBOScript(patcher.desc.meta.rnboversion);
        }

    } catch (err) {
        const errorContext = {
            error: err
        };
        if (response && (response.status >= 300 || response.status < 200)){
            errorContext.header = `Couldn't load patcher export bundle`,
            errorContext.description = `Check app.js to see what file it's trying to load. Currently it's` + 
            `trying to load "${patchExportURL}". If that doesn't` +
            `match the name of the file you exported from RNBO, modify` +
            ` patchExportURL in script.js.`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }

    loadingAnimations("loading..", "fetching audio file URLs");
    //fetching default samples (not loading... just fetching)
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch('export/dependencies.json');
        dependencies = await dependenciesResponse.json();

        // prepend 'export' to any file dependencies
        dependencies = dependencies.map(d => d.file ? Object.assign({}, d, { file: d.file }) : d);
    } catch (e) {}

    loadingAnimations("loading...", "creating the device");
    // create the device!
    let device;
    try {
        device = await RNBO.createDevice({context, patcher});
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({error: err});
        } else {
            throw err;
        }
        return;
    }

    loadingAnimations("loading", "getting audio from server into buffers");
    //load the default samples !!
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);

    loadingAnimations("loading.", "connecting to web audio graph");
    //connect to web audio graph
    device.node.connect(outputNode);

    loadingAnimations("loading..", "building waveforms");
    //build waveforms on filedrop
    populateWaveforms(device, context);

    loadingAnimations("loading...", "building mixer");
    buttonSetup(device, outputNode);

    loadingAnimations("loaded", "..", "click once to enable audio");
    //enable audio
    document.body.onclick = () => {
        context.resume();
        //"audio enabled in GUI"
        loadingAnimations("loaded", NaN, "audio enabled");
    }

    //final guardrails statement for debugging
    if (typeof guardrails === "function") guardrails();

    //---------- stuff that can be done once setup is done ----------//
    
    //set a silent mix
    const event = new RNBO.MessageEvent(RNBO.TimeNow, "mixList", [-96, -96, -96, -96, -96, -96]);
    device.scheduleEvent(event);

}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            throw new Error("Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.");
        }
        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            console.log(err);
            reject(new Error("Failed to load rnbo.js v" + version));
        };
        document.body.append(el);
    });
}

//returns a list of 6 dB values with a focus on 2 elements
function generateRandomMix() {
    let values = [];

    //random mix values
    for (let i = 0; i < 6; i++) {
        if (i >= 4){
            values.push(Math.floor(Math.random()*-12)-3);
        } else if (i >= 2) {
            values.push(Math.floor(Math.random()*-18)-18);
        } else {
            values.push(Math.max(Math.floor(Math.random()*-96)-24, -96));
        }
    }

    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }

    return shuffleArray(values);

}

//defines the event listeners for each drop zone, including pushing the files into the RNBO buffers
function populateWaveforms(device, context) {

    const fileDrop1 = document.getElementById("drop-zone-1");
    const fileDrop2 = document.getElementById("drop-zone-2");
    const fileDrop3 = document.getElementById("drop-zone-3");
    const WaveForms = [];
    const ProgressBars = [];

    fileDrop1.addEventListener("drop", (e) => dropHandler(e, 1, device));
    fileDrop2.addEventListener("drop", (e) => dropHandler(e, 2, device));
    fileDrop3.addEventListener("drop", (e) => dropHandler(e, 3, device));

    fileDrop1.addEventListener("change", (e) => dropHandler(e, 1, device));
    fileDrop2.addEventListener("change", (e) => dropHandler(e, 2, device));
    fileDrop3.addEventListener("change", (e) => dropHandler(e, 3, device));

    //prevent default drop behavior
    window.addEventListener("drop", (e) => {
        if (!e.dataTransfer) return;
        if ([...e.dataTransfer.items].some((item) => item.kind === "file")) {
            e.preventDefault();
        }
    });

    //define prevent default dragover behavior for file drop zones
    function dragOverPrevention(e) {
        if (!e.dataTransfer) return;
        const fileItems = [...e.dataTransfer.items].filter(
            (item) => item.kind === "file",
        );
        if (fileItems.length > 0) {
            e.preventDefault();
            if (fileItems.some((item) =>
            item.type.startsWith("audio/"))) {
                e.dataTransfer.dropEffect = "copy";
            } else {
                e.dataTransfer.dropEffect = "none";
            }
        }
    }

    fileDrop1.addEventListener("dragover", (e) => dragOverPrevention(e));
    fileDrop2.addEventListener("dragover", (e) => dragOverPrevention(e));
    fileDrop3.addEventListener("dragover", (e) => dragOverPrevention(e));

    //prevent default dragover behavior
    window.addEventListener("dragover", (e) => {
        if (!e.dataTransfer) return;
        const fileItems = [...e.dataTransfer.items].filter(
            (item) => item.kind === "file",
        );
        if (fileItems.length > 0)
            e.preventDefault();
    });

    async function dropHandler(ev, index, device) {
        ev.preventDefault();
        let files = [];

        loadingAnimations("loading...", "fetching new audio");
        // If this is a native drop event, prefer DataTransfer.files
        if (ev.dataTransfer) {
            if (ev.dataTransfer.files && ev.dataTransfer.files.length) {
                files = Array.from(ev.dataTransfer.files);
            } else if (ev.dataTransfer.items && ev.dataTransfer.items.length) {
                files = Array.from(ev.dataTransfer.items)
                    .map((item) => item.getAsFile())
                    .filter((file) => file);
            }
        }

        // If this was an input `change` event, fallback to the input's files
        if ((!files || files.length === 0) && ev.target && ev.target.files) {
            files = Array.from(ev.target.files);
        }

        if (!files || files.length === 0) return;

        loadingAnimations("loading...", "loading new audio into buffer");
        let success = await loadAudioIntoBuffer(files, index, device);
        if (success){
            loadingAnimations("loading...", "generating new waveforms");
            await generateWaveforms(files, index);
            loadingAnimations("loaded", "..")
        } else
            loadingAnimations("ERROR", "got stuck loading audio into buffers");

        return;
    }

    async function loadAudioIntoBuffer(files, index, device) {
        //here is where wavesurfer behavior, RNBO behavior go

        let file = files[0];
        let buffers = ["layer1", "layer2", "layer3"];

        if (file.type.startsWith("audio/")) {
            const arrayBuf = await file.arrayBuffer();
            const audioBuf = await context.decodeAudioData(arrayBuf);
            await device.setDataBuffer(buffers[index - 1], audioBuf);
        } else {
            console.error("files must be of supported type!!");
            return false;
        }

        return true;
    }

    function initializeWaveforms(device) {
        let defaultFileURLs = [
            "https://media.murrayrobertsonmusic.com/Mooring2/drums%20Crotch_M60-MP3.mp3",
            "https://media.murrayrobertsonmusic.com/Mooring2/E%20GTR%20a_M80-MP3.mp3",
            "https://media.murrayrobertsonmusic.com/Mooring2/Vox%20Center_M81-MP3.mp3"
        ];

        for (let col = 0; col < 3; col++) {
            let column = document.getElementById(`column${col + 1}`);
            let waveformColumn = [];
            let progressBarColumn = [];

            for (let row = 0; row < 4; row++) {
                const container = document.createElement('div');
                container.id = `waveform-${col + 1}-${row + 1}`;
                column.appendChild(container);

                const regionsPlugin = RegionsPlugin.create();

                const ws = WaveSurfer.create({
                    container: container,
                    url: defaultFileURLs[col],
                    plugins: [regionsPlugin],
                    barWidth: 2,
                    cursorWidth: 0
                });

                // attach the plugin reference directly to the ws object
                ws._regions = regionsPlugin;
                //add waveform to our list for later stuff
                waveformColumn.push(ws);

                //make the progress bar below the waveform
                const progressBar = document.createElement('progress');
                progressBar.classList.add("progress-bar");
                progressBar.max = 100;
                progressBar.value = 0;
                progressBar.style.setProperty('--max', progressBar.max);
                progressBar.style.setProperty('--value', progressBar.value);
                progressBar.style.setProperty('--progress-value', progressBar.value);
                column.appendChild(progressBar);
                //add progress bar to our list for later stuff
                progressBarColumn.push(progressBar);
            }
            WaveForms.push(waveformColumn);
            ProgressBars.push(progressBarColumn);
        }
    }

    async function generateWaveforms(files, index) {
        let waveformsToUpdate = WaveForms[index-1];

        waveformsToUpdate.forEach((ws) => {
            ws.loadBlob(files[0]);
        })

        return;
    }

    function updateSelection(ws, selection) {
        ws._regions.clearRegions();
        const start = selection[1]/1000;
        const end = selection[2]/1000;
        
        if (end - start < ws.getDuration()/240)
            ws._regions.addRegion({
                start: start,
                end: start + ws.getDuration()/240,
                color: "white",
                drag: false,
                resize: false,
            });
        else
            ws._regions.addRegion({
                start: start,
                end: end,
                color: "#fafafa",
                drag: false,
                resize: false,
            });
    }

    function updatePosition(pb, position) {
        const value = Number(position[1]*100);
        pb.max = 100;
        pb.value = value;
        pb.style.setProperty('--max', pb.max);
        pb.style.setProperty('--value', value);
        pb.style.setProperty('--progress-value', value);
    }

    initializeWaveforms(device);

    //connect selections
    device.messageEvent.subscribe((ev) => {
            if (ev.tag == "selection")
                updateSelection(WaveForms[(Math.floor(ev.payload[0]/10)-1)][(ev.payload[0]%10)-1], ev.payload);
            if (ev.tag == "position")
                updatePosition(ProgressBars[(Math.floor(ev.payload[0]/10)-1)][(ev.payload[0]%10)-1], ev.payload);
        });  
}

function buttonSetup(device, outputNode) {
    //solo buttons
    //mix faders
    //automate mixes toggle
    //on/off toggle

    let mixer = document.getElementById("mixer");
    let faders = [];

    for (let column = 0; column < 6; column++) {
        let newDiv = document.createElement("div");
        newDiv.classList.add("mixer-strip");
        newDiv.id = `layer${column+1}-mix-strip`;
        
        let label = document.createElement("h2");
        label.innerHTML = `${column+1}`;
        label.classList.add("label");
        label.id = `layer${column+1}-label`;

        let fader = document.createElement("input");
        fader.type = "range";
        fader.classList.add("volume");
        fader.classList.add("fader");
        fader.min = -96;
        fader.max = 0;
        fader.value = 0;
        fader.id = `layer${column+1}-fader`;

        // listener for slider
        fader.addEventListener("input", (e) => {
            const event = new RNBO.MessageEvent(RNBO.TimeNow, `fader${column+1}`, [parseFloat(e.target.value)]);
            device.scheduleEvent(event);
        });

        faders.push(fader);

        /*let soloButton = document.createElement("input");
        soloButton.type = "checkbox";
        soloButton.classList.add("solo-button");
        soloButton.id = `layer${column+1}-solo-button`;

        //add listener for solo button
        soloButton.addEventListener("")*/

        newDiv.appendChild(label);
        //newDiv.appendChild(soloButton);
        newDiv.appendChild(fader);
    
        mixer.appendChild(newDiv);
    }

    //main fader
    let mainDiv = document.createElement("div");
    mainDiv.classList.add("mixer-strip");
    mainDiv.id = "master-strip";

    let mainLabel = document.createElement("h2");
    mainLabel.innerHTML = "main";
    mainLabel.classList.add("label");
    mainLabel.id = "main-label";

    let mainFader = document.createElement("input");
    mainFader.type = "range";
    mainFader.classList.add("volume");
    mainFader.classList.add("fader");
    mainFader.min = -36;
    mainFader.max = 0;
    mainFader.value = -36;
    mainFader.id = "main-fader";

    //listneer for main fader goes here
    mainFader.addEventListener("input", (e) => {
        if (mainToggle.checked == true) {
            const decimal = Math.pow(10, parseFloat(e.target.value) / 20);
            outputNode.gain.value = decimal;
        }
    });

    let mainToggle = document.createElement("input");
    mainToggle.type = "checkbox";
    mainToggle.classList.add("solo-button");
    mainToggle.id = "main-toggle";
    mainToggle.name = "click here to turn on"

    let labelfortoggle = document.createElement("label");
    labelfortoggle.setAttribute("for", "main-toggle");
    labelfortoggle.innerHTML = "^^CLICK HERE FIRST^^";
    labelfortoggle.style.color = "green";

    //listener for main toggle goes here
    mainToggle.addEventListener("change", () => {
        labelfortoggle.style.display = "none";
        if (mainToggle.checked == true) {
            const event = new RNBO.MessageEvent(RNBO.TimeNow, "metroToggle", [ 1 ]);
            device.scheduleEvent(event);

            mainFader.value = -6;
            outputNode.gain.value = 0.5;
        } else {
            const event = new RNBO.MessageEvent(RNBO.TimeNow, "metroToggle", [ 0 ]);
            device.scheduleEvent(event);

            mainFader.value = -36;
            outputNode.gain.value = 0;
        }
    });

    let lastDiv = document.createElement("div");
    lastDiv.classList.add("mixer-strip");
    lastDiv.id = "final-buttons"

    let startButton = document.createElement("button");
    startButton.id = "start-button";
    startButton.classList.add("fuck");
    startButton.innerHTML = "bring up";

    //listener for random mix button
    startButton.addEventListener("click", () => {
        const event = new RNBO.MessageEvent(RNBO.TimeNow, "mixList", generateRandomMix());
        device.scheduleEvent(event);
    });

    let newMixButton = document.createElement("button");
    newMixButton.id = "random-mix-button";
    newMixButton.classList.add("fuck");
    newMixButton.innerHTML = "new mix";

    //listener for random mix button
    newMixButton.addEventListener("click", () => {
        const event = new RNBO.MessageEvent(RNBO.TimeNow, "mixList", generateRandomMix());
        device.scheduleEvent(event);
    });

    let endButton = document.createElement("button");
    endButton.id = "end-button";
    endButton.classList.add("fuck");
    endButton.innerHTML = "bring down";

    //listener for random mix button
    endButton.addEventListener("click", () => {
        const event = new RNBO.MessageEvent(RNBO.TimeNow, "mixList", [-96, -96, -96, -96, -96, -96]);
        device.scheduleEvent(event);
    });

    mainDiv.appendChild(mainLabel);
    mainDiv.appendChild(mainToggle);
    mainDiv.appendChild(labelfortoggle);
    mainDiv.appendChild(mainFader);

    mixer.appendChild(mainDiv);

    lastDiv.appendChild(startButton);
    lastDiv.appendChild(newMixButton);
    lastDiv.appendChild(endButton);
    mixer.appendChild(lastDiv);

    //Listening to RNBO for mix slider values
    // ev is of type MessageEvent, which has a tag and a payload
    device.messageEvent.subscribe((ev) => {
        for (let i = 0; i < 6; i++) {
            if (ev.tag == `mix${i+1}`)
                faders[i].value = ev.payload;
        }
    });     
}

function loadingAnimations(loadingtext, labeltext, auxtext) {
    const loadingElement = document.getElementById("loading-text");
    const labelElement = document.getElementById("label-text");
    const auxElement = document.getElementById("aux-text");

    loadingElement.innerHTML = loadingtext;
    
    if (labeltext){
        labelElement.innerHTML = labeltext;
        labelElement.style.display = "inline";
    }

    if (auxtext){
        auxElement.innerHTML = auxtext;
        auxElement.style.display = "inline";
    }

    if (loadingtext == "loaded")
        loadingElement.style.color = "green";
    else
        loadingElement.style.color = "red";

}

loadingAnimations("loading...", "starting setup");
setup();