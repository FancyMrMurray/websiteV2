async function setup() {
    console.log("01 - started setup");
    const scriptSrc = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : new URL('/pages/interactiveArt/Homepage/').href;
    const scriptBaseURL = new URL('.', scriptSrc);
    const patchExportURL = new URL('../export/patch.export.json', scriptBaseURL).href;
    const dependenciesURL = new URL('../export/dependencies.json', scriptBaseURL).href;

    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();
    console.log("02 - audio context created");

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();
    outputNode.connect(context.destination);
    console.log("03 - output node created");
    
    // Fetch the exported patcher
    let response, patcher;
    try {
        response = await fetch(patchExportURL);

        if (!response.ok) {
            const bodyText = await response.text();
            throw new Error(`Failed to load patch export (${response.status} ${response.statusText}): ${bodyText.slice(0, 200)}`);
        }

        const responseText = await response.text();
        try {
            patcher = JSON.parse(responseText);
        } catch (parseErr) {
            throw new Error(`Invalid JSON in patch export: ${parseErr.message}\nResponse body:\n${responseText.slice(0, 500)}`);
        }

        if (!window.RNBO) {
            // Load RNBO script dynamically
            // Note that you can skip this by knowing the RNBO version of your patch
            // beforehand and just include it using a <script> tag
            await loadRNBOScript(patcher.desc.meta.rnboversion);
        }

    } catch (err) {
        const errorContext = {
            error: err
        };
        if (response && (response.status >= 300 || response.status < 200)) {
            errorContext.header = `Couldn't load patcher export bundle`,
            errorContext.description = `Check homepage.js to see what file it's trying to load. Currently it's` +
            ` trying to load "${patchExportURL}". If that doesn't` + 
            ` match the name of the file you exported from RNBO, modify` + 
            ` patchExportURL in homepage.js.`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }
    console.log("04 - patcher loaded");
    
    // (Optional) Fetch the dependencies
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch(dependenciesURL);
        if (dependenciesResponse.ok) {
            dependencies = await dependenciesResponse.json();
            // Prepend "export" to any file dependenciies
            dependencies = dependencies.map(d => d.file ? Object.assign({}, d, { file: d.file }) : d);
        }
    } catch (e) {}
    console.log("05 - dependency URLs loaded");

    // Create the device
    let device;
    try {
        device = await RNBO.createDevice({ context, patcher });
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({ error: err });
        } else {
            throw err;
        }
        return;
    }
    console.log("06 - device created");

    // (Optional) Load the samples
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);
    console.log("07 - loaded dependencie into buffers");

    // Connect the device to the web audio graph
    device.node.connect(outputNode);
    console.log("08 - device connected to web audio graph");

    GUIfunctions(true);
    console.log("09 - updated GUI");

    distanceCalculation(device);
    console.log("10 - begun calculating distance");
    keyCodes(device);
    console.log("11 - connected keycodes");

    let firstClick = true;
    document.body.onclick = () => {
        context.resume();

        if (firstClick){
            firstClick = false;
            isMuted = false;
            outputNode.gain.value = 1;
            volumeImg.src = '/components/mute-btn/assets/at-volume.svg';
            document.querySelector('.status__prompt').innerHTML = "audio enabled";
        }
    }
    console.log("12 - added listener for audio context engage");

    // Volume control setup
    let isMuted = true;
    outputNode.gain.value = 0;
    let volumeButton = document.querySelector('.mute-btn');
    let volumeImg = volumeButton.querySelector('img');
    
    volumeButton.addEventListener('click', () => {
        isMuted = !isMuted; // set state
        outputNode.gain.value = isMuted ? 0 : 1; // mute the output
        volumeImg.src = isMuted ? '/components/mute-btn/assets/at-mute.svg' : '/components/mute-btn/assets/at-volume.svg'; // switch the image
        volumeImg.alt = isMuted ? 'Unmute' : 'Mute'; // switch the alt text
        console.log(outputNode.gain.value);
    });
    console.log("13 - setup for unmuting completed");

    // Skip if you're not using guardrails.js
    if (typeof guardrails === "function")
        guardrails();
    console.log("14 - guardrails completed");
}

function loadRNBOScript(version) {
    console.log("started 'loadRNBOScript'");
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
        console.log("finished 'loadRNBOScript'");
    });
}

function distanceCalculation(device) {

    let posX = 0;
    let posY = 0;
    let deltaX = 0;
    let deltaY = 0;

    let composerRect = document.getElementById("composer").getBoundingClientRect();
    let composerPosition = {
        x: (composerRect.left + composerRect.right) / 2,
        y: (composerRect.bottom + composerRect.top) / 2,
    }
    let soundDesignRect = document.getElementById("sound-designer").getBoundingClientRect();
    let soundDesignPosition = {
        x: (soundDesignRect.left + soundDesignRect.right) / 2,
        y: (soundDesignRect.bottom + soundDesignRect.top) / 2,
    }
    let interactiveArtistRect = document.getElementById("interactive-artist").getBoundingClientRect();
    let interactiveArtistPosition = {
        x: (interactiveArtistRect.left + interactiveArtistRect.right) / 2,
        y: (interactiveArtistRect.bottom + interactiveArtistRect.top) / 2,
    }

    window.addEventListener("mousemove", (evt) => {
        deltaX = Math.abs(posX - evt.clientX);
        deltaY = Math.abs(posY - evt.clientY);
        
        posX = evt.clientX;
        posY = evt.clientY;
    });

    window.addEventListener("resize", () => {
        composerRect = document.getElementById("composer").getBoundingClientRect();
        composerPosition = {
            x: (composerRect.left + composerRect.right) / 2,
            y: (composerRect.bottom + composerRect.top) / 2,
        }
        soundDesignRect = document.getElementById("sound-designer").getBoundingClientRect();
        soundDesignPosition = {
            x: (soundDesignRect.left + soundDesignRect.right) / 2,
            y: (soundDesignRect.bottom + soundDesignRect.top) / 2,
        }
        interactiveArtistRect = document.getElementById("interactive-artist").getBoundingClientRect();
        interactiveArtistPosition = {
            x: (interactiveArtistRect.left + interactiveArtistRect.right) / 2,
            y: (interactiveArtistRect.bottom + interactiveArtistRect.top) / 2,
        }
    })

    window.addEventListener("scroll", () => {
        composerRect = document.getElementById("composer").getBoundingClientRect();
        composerPosition = {
            x: (composerRect.left + composerRect.right) / 2,
            y: (composerRect.bottom + composerRect.top) / 2,
        }
        soundDesignRect = document.getElementById("sound-designer").getBoundingClientRect();
        soundDesignPosition = {
            x: (soundDesignRect.left + soundDesignRect.right) / 2,
            y: (soundDesignRect.bottom + soundDesignRect.top) / 2,
        }
        interactiveArtistRect = document.getElementById("interactive-artist").getBoundingClientRect();
        interactiveArtistPosition = {
            x: (interactiveArtistRect.left + interactiveArtistRect.right) / 2,
            y: (interactiveArtistRect.bottom + interactiveArtistRect.top) / 2,
        }
    })

    compParam = device.parametersById.get("composer-distance");
    sdParam = device.parametersById.get("sound-design-distance");
    aeParam = device.parametersById.get("audio-engineer-distance");
    granularity = device.parametersById.get("granularity");
        
    async function updateDistancesLoop(device){
        //calculate distances
        compParam.value = Math.sqrt(Math.pow(Math.abs(composerPosition.x - posX) , 2) + Math.pow(Math.abs(composerPosition.y - posY), 2));
        //console.log(compParam.value);
        sdParam.value = Math.sqrt(Math.pow(Math.abs(soundDesignPosition.x - posX) , 2) + Math.pow(Math.abs(soundDesignPosition.y - posY), 2));
        aeParam.value = Math.sqrt(Math.pow(Math.abs(interactiveArtistPosition.x - posX) , 2) + Math.pow(Math.abs(interactiveArtistPosition.y - posY), 2));
        granularity.value = Math.abs(250 - Math.abs(deltaX + deltaY));

        await wait(10);
        updateDistancesLoop(device); // recurse
    }

    updateDistancesLoop(device);
}

function keyCodes(device) {
    window.addEventListener("keydown", e => {
        const message = new RNBO.MessageEvent(RNBO.TimeNow, "key", [e.key.charCodeAt(0)]);
        const sahResetMessage = new RNBO.MessageEvent(RNBO.TimeNow, "SAH RESET", [ 2 ]);
        device.scheduleEvent(message);
        device.scheduleEvent(sahResetMessage);
    })
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function GUIfunctions(loadState) {

    let statusPrompt = document.querySelector('.status__prompt');
    let statusLoad = document.querySelector('.status__load');

    if (!loadState) {
        statusPrompt.style.display = "none";
        statusLoad.innerText = "loading...";
        statusLoad.style.color = "red";
    } else if (loadState) {
        statusPrompt.style.display = "inline";
        statusPrompt.innerHTML = "click once to enable audio";
        statusLoad.innerText = "loaded";
        statusLoad.style.color = "green";
    } else {
        console.error("GUI updated incorrectly");
    }
}

/**
 *  So we need to code functions to 
 *  [x] calculate distances and pass to RNBO device
 *  2) get mouse delta and pass as granularity (inversed so that slow = long grain)
 *  3) pass keycodes into inport "key"
 *  I think this can all be included in setup nothing needing to be initialized outside
 * 
 *  4) a mute button (try to control the WebAudioGraph directly)
 */

//RUN RNBO PATCH - async
GUIfunctions(false);

setup();