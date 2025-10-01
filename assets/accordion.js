const accordionTemplate = document.createElement('template');
accordionTemplate.innerHTML = `
    <div class="accordion__item">
        <button type="button" class="accordion__trigger" aria-expanded="false"></button>
        <div class="accordion__panel hidden"></div>
    </div>
`;

const mobileViewport = '(max-width: 767px)';

let accordionContentId = 0;

async function fetchAccordionData() {
    const endpoint = 'https://aero-mock-api.vercel.app/';
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.json();
}

/**
 * Lightweight accordion web component rendered in the DOM.
 * It keeps header/content text in sync with attributes and ensures
 * only one accordion is open at a time inside the same container.
 */
class Accordion extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.handleHeaderClick = this.handleHeaderClick.bind(this);
    }

    connectedCallback() {
        if (!this._initialized) {
            this.initializeMarkup();
        }

        this.headerEl?.addEventListener('click', this.handleHeaderClick);
    }

    disconnectedCallback() {
        this.headerEl?.removeEventListener('click', this.handleHeaderClick);
    }

    static get observedAttributes() {
        return ['header', 'content'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!this._initialized || oldValue === newValue) return;

        if (name === 'header') this.syncHeaderText();
        if (name === 'content') this.syncContentText();
    }

    initializeMarkup() {
        const fragment = accordionTemplate.content.cloneNode(true);
        this.appendChild(fragment);

        const wrapper = this.firstElementChild;
        this.headerEl = wrapper?.querySelector('.accordion__trigger');
        this.contentEl = wrapper?.querySelector('.accordion__panel');

        if (this.contentEl && !this.contentEl.id) {
            accordionContentId += 1;
            this.contentEl.id = `accordion__panel-${accordionContentId}`;
        }

        this.headerEl?.setAttribute('aria-controls', this.contentEl?.id || '');
        this.syncHeaderText();
        this.syncContentText();
        this.updateDisplay(false);
        this._initialized = true;
    }

    syncHeaderText() {
        if (!this.headerEl) return;
        this.headerEl.textContent = this.getAttribute('header') || 'Accordion Header';
    }

    syncContentText() {
        if (!this.contentEl) return;
        this.contentEl.textContent = this.getAttribute('content') || 'Accordion Content';
    }

    handleHeaderClick() {
        if (this.isOpen) {
            this.close();
            return;
        }

        this.closeOpenSiblings();
        this.open();

        this.dispatchEvent(
            new CustomEvent('accordion--open', {
                bubbles: true,
                detail: {
                    title: this.getAttribute('header') || '',
                    image: this.dataset.image || '',
                },
            })
        );
    }

    closeOpenSiblings() {
        const parent = this.parentElement;
        if (!parent) return;

        const openSibling = parent.querySelector('custom-accordion[data-open]');
        if (openSibling && openSibling !== this && typeof openSibling.close === 'function') {
            openSibling.close();
        }
    }

    open() {
        this.updateDisplay(true);
    }

    close() {
        this.updateDisplay(false);
    }

    updateDisplay(isOpen) {
        if (this.isOpen === isOpen) return;

        this.isOpen = isOpen;
        this.toggleAttribute('data-open', isOpen);
        this.headerEl?.setAttribute('aria-expanded', String(isOpen));
        this.contentEl?.classList.toggle('hidden', !isOpen);
    }
}

customElements.define('custom-accordion', Accordion);

/**
 * Fetch accordion data, draw accordions, and coordinate the shared hero image.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const itemsContainer = document.querySelector('[id^="accordion__items-"]');
    if (!itemsContainer) return;

    const mainImage = document.getElementById('accordion__image');
    if (!mainImage) return;

    const layout = document.querySelector('.accordion__layout');
    const placeholderSrc = mainImage.dataset.placeholderSrc || mainImage.getAttribute('src') || '';

    const openFirst = itemsContainer.dataset.openFirst === 'true';
    const preloadedImages = new Set();
    const mobileViewportQuery = window.matchMedia(mobileViewport);
    let firstAccordionRef = null;

    const markLayoutReady = () => layout?.classList.remove('is-loading');

    const closeOtherAccordions = (target) => {
        const openAccordions = itemsContainer.querySelectorAll('custom-accordion[data-open]');
        openAccordions.forEach((accordion) => {
            if (accordion !== target) accordion.close?.();
        });
    };

    /** Updates placeholder vs loaded states on the shared image. */
    const syncMainImageState = (src) => {
        const isPlaceholder = !src || src === placeholderSrc;
        mainImage.classList.toggle('is-placeholder', isPlaceholder);
        mainImage.classList.toggle('has-image', !isPlaceholder);
        if (isPlaceholder) mainImage.classList.remove('is-loading');
    };

    /** Ensures the placeholder is shown until an actual image loads. */
    const ensurePlaceholder = () => {
        if (!mainImage.dataset.accordionImageBound) {
            mainImage.addEventListener('load', () => {
                syncMainImageState(mainImage.currentSrc || mainImage.src);
                mainImage.classList.remove('is-loading');
            });
            mainImage.dataset.accordionImageBound = 'true';
        }

        if (!mainImage.src || mainImage.src === window.location.href) {
            mainImage.src = placeholderSrc || mainImage.src;
        }

        syncMainImageState(mainImage.src);
    };

    /** Injects the hero image into the correct container for the current viewport. */
    const placeMainImage = (accordion) => {
        if (mobileViewportQuery.matches) {
            const target = accordion
                || itemsContainer.querySelector('custom-accordion[data-open]')
                || itemsContainer.querySelector('custom-accordion');
            const panel = target?.querySelector('.accordion__panel');
            if (!panel) return false;
            panel.insertAdjacentElement('afterbegin', mainImage);
            return true;
        }

        const desktopContainer = document.querySelector('.accordion__image');
        if (desktopContainer) {
            desktopContainer.appendChild(mainImage);
            return true;
        }

        const containerParent = itemsContainer.parentElement;
        if (containerParent) {
            containerParent.insertBefore(mainImage, itemsContainer);
            return true;
        }

        return false;
    };

    /** Preload helper so the hero image swaps are instant whenever possible. */
    const preloadImage = (src) => {
        if (!src || src === placeholderSrc || preloadedImages.has(src)) return;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        link.setAttribute('data-accordion-preload', 'true');
        document.head.appendChild(link);
        preloadedImages.add(src);
    };

    /** Updates the shared image source/alt text and handles state classes. */
    const updateMainImage = (src, title = '') => {
        const fallbackSrc = placeholderSrc || mainImage.src || '';
        const nextSrc = src || fallbackSrc;
        const isPlaceholder = !src || nextSrc === placeholderSrc || !nextSrc;

        if (!isPlaceholder && nextSrc && mainImage.src !== nextSrc) {
            preloadImage(nextSrc);
            mainImage.classList.add('is-loading');
        }

        if (nextSrc && mainImage.src !== nextSrc) {
            mainImage.src = nextSrc;
        } else {
            syncMainImageState(nextSrc);
        }

        mainImage.alt = title;
    };

    /** Handles accordion-open events so the hero image follows the active item. */
    const handleAccordionOpen = (event) => {
        const accordion = event.currentTarget;
        const imageSrc = accordion.dataset.image;
        preloadImage(imageSrc);
        placeMainImage(accordion);
        updateMainImage(imageSrc, accordion.getAttribute('header') || '');
    };

    /** Keeps the hero image in sync when resizing between mobile/desktop. */
    const bindViewportListener = () => {
        const handler = () => {
            const active = itemsContainer.querySelector('custom-accordion[data-open]')
                || itemsContainer.querySelector('custom-accordion');
            placeMainImage(active);
        };

        if (typeof mobileViewportQuery.addEventListener === 'function') {
            mobileViewportQuery.addEventListener('change', handler);
        } else if (typeof mobileViewportQuery.addListener === 'function') {
            mobileViewportQuery.addListener(handler);
        }

        handler();
        return handler;
    };

    ensurePlaceholder();
    bindViewportListener();

    try {
        const response = await fetchAccordionData();
        const items = Array.isArray(response.items) ? response.items : [];

        updateHeading(response);

        if (!items.length) {
            itemsContainer.textContent = 'No accordion items found.';
            markLayoutReady();
            return;
        }

        const { firstAccordion, firstImage, firstTitle } = renderAccordions(items);
        firstAccordionRef = firstAccordion || null;

        if (firstImage) preloadImage(firstImage);

        if (!mobileViewportQuery.matches && openFirst && firstAccordionRef) {
            closeOtherAccordions(firstAccordionRef);
            firstAccordionRef.open?.();
        }

        if (!placeMainImage(firstAccordionRef)) {
            requestAnimationFrame(() => placeMainImage(firstAccordionRef));
        }

        updateMainImage(firstImage, firstTitle);
    } catch (error) {
        itemsContainer.textContent = 'Failed to load accordion items.';
        markLayoutReady();
        console.error(error);
    }

    /** Populate the accordion heading copy if the container is present. */
    function updateHeading(data) {
        const heading = document.querySelector('.accordion__heading');
        if (!heading) return;

        const overline = heading.querySelector('.accordion__overline');
        const title = heading.querySelector('.accordion__title');

        if (overline && data.subtitle) {
            overline.textContent = data.subtitle;
        }

        if (title && data.title) {
            const text = data.title;
            if (/two/i.test(text)) {
                title.innerHTML = text.replace(/(two)/gi, '<span>$1</span>');
            } else {
                title.textContent = text;
            }
        }
    }

    /** Build and insert accordion instances based on API data. */
    function renderAccordions(items) {
        const fragment = document.createDocumentFragment();
        let firstAccordion = null;
        let firstImage = '';
        let firstTitle = '';

        items.forEach((item, index) => {
            const accordion = document.createElement('custom-accordion');
            if (item.title) accordion.setAttribute('header', item.title);
            if (item.description) accordion.setAttribute('content', item.description);
            if (item.image) accordion.dataset.image = item.image;

            accordion.addEventListener('accordion--open', handleAccordionOpen);
            fragment.appendChild(accordion);

            if (index === 0) {
                firstAccordion = accordion;
                firstImage = item.image || '';
                firstTitle = item.title || '';
            }
        });

        itemsContainer.appendChild(fragment);
        markLayoutReady();

        return { firstAccordion, firstImage, firstTitle };
    }
});
