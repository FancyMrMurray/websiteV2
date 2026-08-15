const overlay = document.querySelector('.overlay');
const overlayVideo = document.querySelector('.overlay__video');
const overlayTitle = document.querySelector('.overlay__metadata--title');
const overlayDesc = document.querySelector('.overlay__metadata--desc');
const overlayCloseBtn = document.querySelector('.overlay__close-btn');

if (!overlay || !overlayVideo || !overlayTitle || !overlayDesc || !overlayCloseBtn) {
    throw new Error('Missing fullscreen overlay elements')
}

let isOpen = false;

document.querySelectorAll('.strip').forEach((strip) => {
    if (strip.classList.contains('strip--link')) return;
    
    strip.addEventListener('click', () => {
        if (isOpen) return;

        isOpen = true;

        const rect = strip.getBoundingClientRect();

        overlayTitle.textContent = strip.dataset.title;
        overlayDesc.textContent = strip.dataset.desc;

        overlayVideo.src = strip.dataset.src;
        overlayVideo.currentTime = 0;
        overlayVideo.muted = false;

        overlay.style.transition = 'none';
        overlay.style.top = `${rect.top}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.display = 'block';
        requestAnimationFrame(() => {
            //first frame: browser has processed display:block and initial position is committed
            requestAnimationFrame(() => {
                //second frame: initial state is painted- safe to animate
                overlay.style.transition = '';
                overlay.style.top = '0px';
                overlay.style.left = '0px';
                overlay.style.width = '100vw';
                overlay.style.height = '100vh';
                overlay.classList.add('overlay--open');
            })
        })

        overlay.addEventListener('transitionend', () => {
            overlayVideo.play().catch((err) => { throw new Error(err) });
        }, { once: true });
    
        document.body.style.overflow = 'hidden';
    })
})

const closeOverlay = () => {
    if (!isOpen) return;

    overlayVideo.pause();
    overlay.classList.remove('overlay--open');

    overlay.style.top = '50vh';
    overlay.style.left = '0px';
    overlay.style.width = '100vw';
    overlay.style.height = '0px';

    overlay.addEventListener('transitionend', () => {
        overlay.style.display = 'none';
        overlayVideo.src = ''; //release memory
        document.body.style.overflow = '';
        isOpen = false;
    }, { once: true });
}

overlayCloseBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    closeOverlay();
})

document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') closeOverlay();
})