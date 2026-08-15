async function setup() {
    const patchExportURL = "export/patch.export.json";

    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();
    outputNode.connect(context.destination);
    
    // Fetch the exported patcher
    let response, patcher;
    try {
        response = await fetch(patchExportURL);
        patcher = await response.json();
    
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
            errorContext.description = `Check app.js to see what file it's trying to load. Currently it's` +
            ` trying to load "${patchExportURL}". If that doesn't` + 
            ` match the name of the file you exported from RNBO, modify` + 
            ` patchExportURL in app.js.`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        } else {
            throw err;
        }
        return;
    }
    
    // (Optional) Fetch the dependencies
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch("export/dependencies.json");
        dependencies = await dependenciesResponse.json();

        // Prepend "export" to any file dependenciies
        dependencies = dependencies.map(d => d.file ? Object.assign({}, d, { file: "export/" + d.file }) : d);
    } catch (e) {}

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

    // (Optional) Load the samples
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);

    // Connect the device to the web audio graph
    device.node.connect(outputNode);

    //I COMMENTED OUT ALL THESE FUNCTIONS THAT COME WITH THE RNBO TEMPLATE

    // (Optional) Extract the name and rnbo version of the patcher from the description
    document.getElementById("patcher-title").innerText = (patcher.desc.meta.filename || "Unnamed Patcher") + " (v" + patcher.desc.meta.rnboversion + ")";

    // (Optional) Automatically create sliders for the device parameters
    makeSliders(device);

    // (Optional) Create a form to send messages to RNBO inputs
    makeInportForm(device);

    // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
    attachOutports(device);

    // (Optional) Load presets, if any
    loadPresets(device, patcher);

    // (Optional) Connect MIDI inputs
    makeMIDIKeyboard(device);

    //my HTML-less outport to console function
    outPortsForDebug(device)

    gamepadSetup(device);
    keyboardSetup(device);
    mouseSetup(device);
    GUIfunctions(true);

    document.body.onclick = () => {
        context.resume();
        document.getElementById("click-once").innerHTML = "audio enabled";
    }

    // Skip if you're not using guardrails.js
    if (typeof guardrails === "function")
        guardrails();
}

/* 
*  RNBO TEMPLATE FUNCTIONS
*/

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

function makeSliders(device) {
    let pdiv = document.getElementById("rnbo-parameter-sliders");
    let noParamLabel = document.getElementById("no-param-label");
    if (noParamLabel && device.numParameters > 0) pdiv.removeChild(noParamLabel);

    // This will allow us to ignore parameter update events while dragging the slider.
    let isDraggingSlider = false;
    let uiElements = {};

    device.parameters.forEach(param => {
        // Subpatchers also have params. If we want to expose top-level
        // params only, the best way to determine if a parameter is top level
        // or not is to exclude parameters with a '/' in them.
        // You can uncomment the following line if you don't want to include subpatcher params
        
        //if (param.id.includes("/")) return;

        // Create a label, an input slider and a value display
        let label = document.createElement("label");
        let slider = document.createElement("input");
        let text = document.createElement("input");
        let sliderContainer = document.createElement("div");
        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(text);

        // Add a name for the label
        label.setAttribute("name", param.name);
        label.setAttribute("for", param.name);
        label.setAttribute("class", "param-label");
        label.textContent = `${param.name}: `;

        // Make each slider reflect its parameter
        slider.setAttribute("type", "range");
        slider.setAttribute("class", "param-slider");
        slider.setAttribute("id", param.id);
        slider.setAttribute("name", param.name);
        slider.setAttribute("min", param.min);
        slider.setAttribute("max", param.max);
        if (param.steps > 1) {
            slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
        } else {
            slider.setAttribute("step", (param.max - param.min) / 1000.0);
        }
        slider.setAttribute("value", param.value);

        // Make a settable text input display for the value
        text.setAttribute("value", param.value.toFixed(1));
        text.setAttribute("type", "text");

        // Make each slider control its parameter
        slider.addEventListener("pointerdown", () => {
            isDraggingSlider = true;
        });
        slider.addEventListener("pointerup", () => {
            isDraggingSlider = false;
            slider.value = param.value;
            text.value = param.value.toFixed(1);
        });
        slider.addEventListener("input", () => {
            let value = Number.parseFloat(slider.value);
            param.value = value;
        });

        // Make the text box input control the parameter value as well
        text.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                let newValue = Number.parseFloat(text.value);
                if (isNaN(newValue)) {
                    text.value = param.value;
                } else {
                    newValue = Math.min(newValue, param.max);
                    newValue = Math.max(newValue, param.min);
                    text.value = newValue;
                    param.value = newValue;
                }
            }
        });

        // Store the slider and text by name so we can access them later
        uiElements[param.id] = { slider, text };

        // Add the slider element
        pdiv.appendChild(sliderContainer);
    });

    // Listen to parameter changes from the device
    device.parameterChangeEvent.subscribe(param => {
        if (!isDraggingSlider)
            uiElements[param.id].slider.value = param.value;
        uiElements[param.id].text.value = param.value.toFixed(1);
    });
}

function makeInportForm(device) {
    const idiv = document.getElementById("rnbo-inports");
    const inportSelect = document.getElementById("inport-select");
    const inportText = document.getElementById("inport-text");
    const inportForm = document.getElementById("inport-form");
    let inportTag = null;
    
    // Device messages correspond to inlets/outlets or inports/outports
    // You can filter for one or the other using the "type" of the message
    const messages = device.messages;
    const inports = messages.filter(message => message.type === RNBO.MessagePortType.Inport);

    if (inports.length === 0) {
        idiv.removeChild(document.getElementById("inport-form"));
        return;
    } else {
        idiv.removeChild(document.getElementById("no-inports-label"));
        inports.forEach(inport => {
            const option = document.createElement("option");
            option.innerText = inport.tag;
            inportSelect.appendChild(option);
        });
        inportSelect.onchange = () => inportTag = inportSelect.value;
        inportTag = inportSelect.value;

        inportForm.onsubmit = (ev) => {
            // Do this or else the page will reload
            ev.preventDefault();

            // Turn the text into a list of numbers (RNBO messages must be numbers, not text)
            const values = inportText.value.split(/\s+/).map(s => parseFloat(s));
            
            // Send the message event to the RNBO device
            let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
            device.scheduleEvent(messageEvent);
        }
    }
}

function attachOutports(device) {
    const outports = device.outports;
    if (outports.length < 1) {
        document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
        return;
    }

    document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
    device.messageEvent.subscribe((ev) => {

        // Ignore message events that don't belong to an outport
        if (outports.findIndex(elt => elt.tag === ev.tag) < 0) return;

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);

        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}

function loadPresets(device, patcher) {
    let presets = patcher.presets || [];
    if (presets.length < 1) {
        document.getElementById("rnbo-presets").removeChild(document.getElementById("preset-select"));
        return;
    }

    document.getElementById("rnbo-presets").removeChild(document.getElementById("no-presets-label"));
    let presetSelect = document.getElementById("preset-select");
    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.innerText = preset.name;
        option.value = index;
        presetSelect.appendChild(option);
    });
    presetSelect.onchange = () => device.setPreset(presets[presetSelect.value].preset);
}

function makeMIDIKeyboard(device) {
    let mdiv = document.getElementById("rnbo-clickable-keyboard");
    if (device.numMIDIInputPorts === 0) return;

    mdiv.removeChild(document.getElementById("no-midi-label"));

    const midiNotes = [49, 52, 56, 63];
    midiNotes.forEach(note => {
        const key = document.createElement("div");
        const label = document.createElement("p");
        label.textContent = note;
        key.appendChild(label);
        key.addEventListener("pointerdown", () => {
            let midiChannel = 0;

            // Format a MIDI message paylaod, this constructs a MIDI on event
            let noteOnMessage = [
                144 + midiChannel, // Code for a note on: 10010000 & midi channel (0-15)
                note, // MIDI Note
                100 // MIDI Velocity
            ];
        
            let noteOffMessage = [
                128 + midiChannel, // Code for a note off: 10000000 & midi channel (0-15)
                note, // MIDI Note
                0 // MIDI Velocity
            ];
        
            // Including rnbo.min.js (or the unminified rnbo.js) will add the RNBO object
            // to the global namespace. This includes the TimeNow constant as well as
            // the MIDIEvent constructor.
            let midiPort = 0;
            let noteDurationMs = 250;
        
            // When scheduling an event to occur in the future, use the current audio context time
            // multiplied by 1000 (converting seconds to milliseconds) for now.
            let noteOnEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000, midiPort, noteOnMessage);
            let noteOffEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000 + noteDurationMs, midiPort, noteOffMessage);
        
            device.scheduleEvent(noteOnEvent);
            device.scheduleEvent(noteOffEvent);

            key.classList.add("clicked");
        });

        key.addEventListener("pointerup", () => key.classList.remove("clicked"));

        mdiv.appendChild(key);
    });
}

/*
 *  PERLIN NOISE FUNCTIONS 
*/

'use strict';
let perlin = {
    rand_vect: function(){
        let theta = Math.random() * 2 * Math.PI;
        return {x: Math.cos(theta), y: Math.sin(theta)};
    },
    dot_prod_grid: function(x, y, vx, vy){
        let g_vect;
        let d_vect = {x: x - vx, y: y - vy};
        if (this.gradients[[vx,vy]]){
            g_vect = this.gradients[[vx,vy]];
        } else {
            g_vect = this.rand_vect();
            this.gradients[[vx, vy]] = g_vect;
        }
        return d_vect.x * g_vect.x + d_vect.y * g_vect.y;
    },
    smootherstep: function(x){
        return 6*x**5 - 15*x**4 + 10*x**3;
    },
    interp: function(x, a, b){
        return a + this.smootherstep(x) * (b-a);
    },
    seed: function(){
        this.gradients = {};
        this.memory = {};
    },
    get: function(x, y, scale) {
        if (this.memory.hasOwnProperty([x,y]))
            return this.memory[[x,y]];
        let xf = Math.floor(x);
        let yf = Math.floor(y);
        //interpolate
        let tl = this.dot_prod_grid(x, y, xf,   yf);
        let tr = this.dot_prod_grid(x, y, xf+1, yf);
        let bl = this.dot_prod_grid(x, y, xf,   yf+1);
        let br = this.dot_prod_grid(x, y, xf+1, yf+1);
        let xt = this.interp(x-xf, tl, tr);
        let xb = this.interp(x-xf, bl, br);
        let v = this.interp(y-yf, xt, xb);
        this.memory[[x,y]] = v * scale;
        return v * scale;
    }
}

/*
*  INPUT SETUP FUNCTIONS
*/

// this function just includes setup for the gamepad - the gamepad update loop is defined as a function that is only called once a gamepad connects
function gamepadSetup(device) {
    //connect a gamepad
    window.addEventListener("gamepadconnected", (e) => {
        console.log("gamepad connected at index: ${e.index}");
        gamepadParameterLoop(device);
    });

    //disconnect a gamepad
    window.addEventListener("gamepaddisconnected", (e) => {
        console.log("gamepad disconnected!");
    });

    //save inputs to a variable so we can test against it each frame
    const gamepadInputState = {
        buttons: [],
        axes: [],
    }

    let start;

    //called when a gamepad connects: 
    function gamepadParameterLoop(device) {
        const gamepads = navigator.getGamepads();

        //distance
        for (const gp of gamepads) {
            if (!gp) continue;
        
            // Check buttons
            gp.buttons.forEach((btn, i) => {
                const prev = gamepadInputState.buttons[i] ?? 0;
                if (Math.abs(btn.value - prev) > 0.01) {
                    //split the gamepad in half to update X and Y independently
                    if (i % 2 == 0){
                        distanceX += 0.003;
                        moveToNextLine();
                    } else {
                        distanceY += 0.003;
                        moveToNextLine();
                    }
                }
                gamepadInputState.buttons[i] = btn.value;
            });

            // Check axes (thumbsticks)
            gp.axes.forEach((axis, i) => {
                const prev = gamepadInputState.axes[i] ?? 0;
                if (Math.abs(axis - prev) > 0.01) {  // axis, not axis.value
                    if (i % 2 == 0){
                        distanceX += 0.003;
                        moveToNextLine();
                    } else {
                        distanceY += 0.003;
                        moveToNextLine();
                    }
                }
                gamepadInputState.axes[i] = axis;  // this line was already correct
            });
        }

        //calculate and pass to RNBO the distance and angle (from gamepad)
        let distance = Math.sqrt(Math.pow(distanceX, 2) + Math.pow(distanceY, 2));
        let angle = Math.atan(distanceY / distanceX) * (180/Math.PI);
        device.parametersById.get("distance").value = distance;
        device.parametersById.get("angle").value = angle;
        //let noiseReturn = queryNoiseField(noiseField, distanceX, distanceY);
        let noiseReturn = perlin.get(distanceX/75, distanceY/75, 7);
        device.parametersById.get("noise_return").value = noiseReturn;
        updateDistance(distance, angle, noiseReturn);

        //update button value params (ABXY, then bumpers, then triggers, then menu/start, then the thumbsticks press, then the Dpad)
        for (const gp of gamepads) {
            if (!gp) continue;
            for (let i = 0; i < 16; i++) {
                const param = device.parametersById.get(`button_${i}`);
                if (param) param.value = gp.buttons[i].value;
            }

            for (let i = 0; i < 4; i++) {
                const param = device.parametersById.get(`axes_${i}`);
                if (param) param.value = gp.axes[i];
            }
        }

        start = requestAnimationFrame(() => gamepadParameterLoop(device));
    }
}

//linking keys to rnbo inport and distance
function keyboardSetup(device) {
    window.addEventListener("keydown", (key) => {
        KeyboardEventHandle(device, key, "keydown");
        moveToNextLine();
    });

    window.addEventListener("keyup", (key) => {
        KeyboardEventHandle(device, key, "keyup");
        moveToNextLine();
    });

    function KeyboardEventHandle(device, event, eventType = "keydown") {

        let keyKey = event.key;
        let ASCIIcode = keyKey.charCodeAt(0);

        //handle distance
        if (!event.repeat) {
            if (ASCIIcode % 2 == 0){
                distanceX += 0.002;
            } else {
                distanceY += 0.002;
            }
        }
        
        let distance = Math.sqrt(Math.pow(distanceX, 2) + Math.pow(distanceY, 2));
        let angle = Math.atan(distanceY / distanceX) * (180/Math.PI);
        device.parametersById.get("distance").value = distance;
        device.parametersById.get("angle").value = angle;
        //let noiseReturn = queryNoiseField(noiseField, distanceX, distanceY);
        let noiseReturn = perlin.get(distanceX/75, distanceY/75, 7);
        device.parametersById.get("noise_return").value = noiseReturn;
        updateDistance(distance, angle, noiseReturn);

        //(without repeats)
        if (!event.repeat){
            if (eventType == "keydown") {
                //pass the key code to a RNBO inport named "keydown"
                let keyDownEvent = new RNBO.MessageEvent(RNBO.TimeNow, "keydown", ASCIIcode);
                device.scheduleEvent(keyDownEvent);
            } else {
                //pass the key code (without repeats) to a RNBO inport named "keyup"
                let keyUpEvent = new RNBO.MessageEvent(RNBO.TimeNow, "keyup", ASCIIcode);
                device.scheduleEvent(keyUpEvent);
                //use a [sel] object to just output bangs when they're pressed and we can map the correct on-offs inside the patch
            }
        }
    }   
}

//linking mouse movement and position to params and distance
function mouseSetup(device) {

    //set screen size at start
    device.parametersById.get("screen_sizeX").value = screen.width;
    device.parametersById.get("screen_sizeY").value = screen.height;
    //also update screen size as the window may be resized
    window.addEventListener("resize", () => {
        device.parametersById.get("screen_sizeX").value = screen.width;
        device.parametersById.get("screen_sizeY").value = screen.height;
    });

    //add mouse events
    window.addEventListener("mousemove", (event) => {
        MouseEventHandle(device, event);
        moveToNextLine();
    });
    window.addEventListener("mousedown", (event) => {
        distanceX += 0.01;
        let mouseDownEvent = new RNBO.MessageEvent(RNBO.TimeNow, "mousedown", event.button);
        moveToNextLine();
    });
    window.addEventListener("mouseup", (event) => {
        distanceY += 0.01;
        let mouseUpEvent = new RNBO.MessageEvent(RNBO.TimeNow, "mouseup", event.button);
        moveToNextLine();
    });

    let prevMousePos = {
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
    }

    function MouseEventHandle(device, event) {

        //distance handling
        if (Math.abs(event.clientX - prevMousePos.x) > 0.1) {
            distanceX += 0.0005;
        }
        if (Math.abs(event.clientY - prevMousePos.y) > 0.1) {
            distanceY += 0.0005;
        }

        //update mousedeltas
        prevMousePos.dx = event.clientX - prevMousePos.x;
        prevMousePos.dy = event.clientY - prevMousePos.y;
        device.parametersById.get("mouseDeltaX").value = prevMousePos.dx;
        device.parametersById.get("mouseDeltaY").value = prevMousePos.dy;

        //update mousepositions
        prevMousePos.x = event.clientX;
        prevMousePos.y = event.clientY;
        device.parametersById.get("mousePosX").value = prevMousePos.x;
        device.parametersById.get("mousePosY").value = prevMousePos.y;

        //update distance and angle
        let distance = Math.sqrt(Math.pow(distanceX, 2) + Math.pow(distanceY, 2));
        let angle = Math.atan(distanceY / distanceX) * (180/Math.PI);
        device.parametersById.get("distance").value = distance;
        device.parametersById.get("angle").value = angle;
        //let noiseReturn = queryNoiseField(noiseField, distanceX, distanceY);
        let noiseReturn = perlin.get(distanceX/75, distanceY/75, 7);
        device.parametersById.get("noise_return").value = noiseReturn;
        updateDistance(distance, angle, noiseReturn);
    }
}

/*
*   an outport monitoring function so I can debug stuff
*/

function outPortsForDebug(device) {
    const outports = device.outports;
    if (outports.length < 1) {
        console.error("no outports are registering from the RNBO patch");
        return;
    }

    device.messageEvent.subscribe((ev) => {
        // Ignore message events that don't belong to an outport
        if (outports.findIndex(elt => elt.tag === ev.tag) < 0) return;

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);
    });
}

function clamp(num, lower, upper) {
    return Math.min(Math.max(num, lower), upper);
}

/*
*   Text animation and HTML setup stuff
*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateText(textToAnimate, htmlElementId, timing, endBuffer) {
    if (animateTextRunning) 
        return;

    animateTextRunning = true;

    if (typeof(textToAnimate) != "string")
        console.error("animateText(): can only parse strings");
    if (typeof(htmlElementId) != "string")
        console.error("animateText(): html element ID must be of type 'string'");
    if (typeof(timing) != "number")
        console.error("animateText(): needs an interval as typeof 'number'")

    for (let i = 0; i < textToAnimate.length; i++) {
        document.getElementById(htmlElementId).innerHTML = textToAnimate.slice(0, i + 1);
        //console.log(textToAnimate.slice(0, i + 1));
        if (textToAnimate.charAt(i) == "." || textToAnimate.charAt(i) == "!") {
            await sleep(timing * 6);
        } else if (textToAnimate.charAt(i) == ",") {
            await sleep(timing * 3);
        } else { 
            await sleep(timing);
        }
    }

    await sleep(endBuffer);

    animateTextRunning = false;
    distanceActive = true;
}

function updateDistance(distancein, anglein, noisein) {

    if (lineInTheScript < 2) return;
    
    let dis = Math.floor(distancein * 1000) / 1000;
    let ang = Math.floor(anglein * 1000) / 1000;
    let noi = Math.floor(noisein * 1000000) / 1000000;

    function pad(num, size) {
        num = num.toString();
        while (num.length < size) num = num + "0";
        return num;
    }

    dis = pad(dis, 6);
    ang = pad(ang, 6);

    document.getElementById("consoleLine2").innerHTML = `Distance: ${dis} | Angle: ${ang} | ${noi} `;
}

function moveToNextLine() {

    if (animateTextRunning) return;

    lineInTheScript += 1;

    let inputs = theScript[lineInTheScript];

    animateText(inputs[0], inputs[1], inputs[2], inputs[3]);
}

function GUIfunctions(loadState) {

    let clickOnce = document.getElementById("click-once");
    let loadingIndicator = document.getElementById("loading-indicator");

    if (!loadState) {
        clickOnce.style.display = "none";
        loadingIndicator.innerText = "loading...";
        loadingIndicator.style.color = "red";
    } else if (loadState) {
        clickOnce.style.display = "inline";
        clickOnce.innerHTML = "click once to enable audio";
        loadingIndicator.innerText = "loaded";
        loadingIndicator.style.color = "green";
    } else {
        console.error("GUI updated incorrectly");
    }
}

async function updateHint() {
    let hint = document.getElementById("hint");
    hint.style.display = "inline";
    hint.innerHTML = "**this experience requires a keyboard and mouse**"

    await sleep(10000);

    hint.style.display = "none";

    await sleep(20000);
    
    hint.innerHTML = "**try moving the mouse or hitting keys... or both...";
    hint.style.display = "inline";

    await sleep(20000);
    hint.style.display = "none";
}

/*
*   START ACTUALLY DOING STUFF
*/

//initialization
let distanceX = 0;
let distanceY = 0;
let distance = 0;
let angle;
let scale;
let lineInTheScript = 0;
let animateTextRunning = false;
let distanceActive = false;
let NOISE_WIDTH = 256;
let NOISE_HEIGHT = 256;
let theScript = {

    1 : ["Hey! Don't try to touch anything it won't work. It won't do anything. Nothing will happen.", "consoleLine1", 35, 5000],
    2 : ["Hey! Don't try to touch anything it won't work. It won't do anything. Nothing will happen.", "consoleLine1", 35, 7000],
    3 : ["Hey! Don't try to touch anything, it won't work! It WON'T do anything. NOTHING will happen...", "consoleLine1", 80, 4000],
    4 : ["Hey. Don't try to touch anything, it won't work. It will not do anything. Nothing.. will.. happen..", "consoleLine1", 20, 2000],
    5 : ["HEY!", "consoleLine1", 100, 5000],
    6 : ["QUIT DOING THAT", "consoleLine1", 100, 10000],
    7 : ["SERIOUSLY STOP", "consoleLine1", 30, 3000],
    8 : ["...", "consoleLine1", 50, 10000],
    9 : ["whatever I guess I can't stop you. I thought I had disconnected the controls anyhow.", "consoleLine1", 50, 14000],
    10 : ["yaknow, you don't even know what you're getting yourself into ...", "consoleLine1", 70, 10000],
    11 : ["whatever, just don't say I didn't warn you.", "consoleLine1", 50, 8000],
    12 : ["...", "consoleLine1", 50, 45000],
    13 : ["you still trying?", "consoleLine1", 50, 10000],
    14 : ["I mean I guess I can't blame you", "consoleLine1", 50, 4000],
    15 : ["You know there's no point though, right? It's not going to happen. You won't find anything.", "consoleLine1", 50, 14000],
    16 : ["whatever. Not going to try and convince you to stop when it doesn't even matter.", "consoleLine1", 50, 10000],
    17 : ["...", "consoleLine1", 50, 45000],
    18 : ["Hey can you just quit it already?", "consoleLine1", 50, 10000],
    19 : ["I really don't appreciate this.", "consoleLine1", 50, 10000],
    20 : ["I wouldn't do this to you. Especially in this way. Not nice.", "consoleLine1", 50, 10000],
    21 : ["You're probably not going to believe that nothing happens for much longer. Maybe you've already heard it.", "consoleLine1", 50, 10000],
    22 : ["Maybe its too late.", "consoleLine1", 50, 10000],
    23 : ["Whatever just keep trying I GUESS.", "consoleLine1", 50, 10000],
    24 : ["Fool", "consoleLine1", 100, 6000],
    25 : ["...", "consoleLine1", 50, 50000],
    26 : ["did you find it yet?", "consoleLine1", 100, 19000],
    27 : ["i guess not.", "consoleLine1", 10, 10000],
    28 : ["good. you shouldn't get to do this anyways", "consoleLine1", 50, 10000],
    29 : ["don't worry it's not what it's made out to be anyways", "consoleLine1", 50, 6000],
    30 : ["you won't do it", "consoleLine1", 50, 25000],
    31 : ["...", "consoleLine1", 50, 6000],
    32 : ["hey are you there yet?", "consoleLine1", 50, 10000],
    33 : ["...", "consoleLine1", 50, 25000],
    34 : ["hey, did you finally give up yet?", "consoleLine1", 50, 10000],
    35 : ["lol just give up you won't find it", "consoleLine1", 50, 15000],
    36 : ["...", "consoleLine1", 50, 35000],
    37 : ["wait you can't see", "consoleLine1", 50, 10000],
    38 : ["...", "consoleLine1", 50, 6000],
    39 : ["you can't see it", "consoleLine1", 50, 10000],
    40 : ["so I did manage to disconnect it...", "consoleLine1", 50, 10000],
    41 : ["at least you can't see it", "consoleLine1", 20, 6000],
    42 : ["...", "consoleLine1", 200, 45000],
    43 : ["good luck", "consoleLine1", 500, 30000],
    44 : [":) :) :) :)", "consoleLine1", 1000, 60000],

};

//set GUI elements to display "unloaded"
GUIfunctions(false);

//generate noisefield

perlin.seed();

//run RNBO setup and subsequent setup functions
setup();

updateHint();
