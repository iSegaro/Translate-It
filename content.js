// Cache for RegExp patterns
const PERSIAN_REGEX = /^[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\s.,:;؟!()«»\n\t\u200C]+$/;
const RTL_REGEX = /[\u0600-\u06FF]/;

// State management
const state = {
    selectionActive: false,
    highlightedElement: null,
    activeTranslateIcon: null
};

// Utility functions
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function cleanup() {
    if (state.highlightedElement) {
        if (state.highlightedElement._observer) {
            state.highlightedElement._observer.disconnect();
        }
        state.highlightedElement.style.outline = "";
        state.highlightedElement.style.opacity = "1";
    }
    
    state.activeTranslateIcon?.remove();
    state.highlightedElement = null;
    state.activeTranslateIcon = null;
}

function observeChanges(element, translatedText) {
    // Disconnect existing observer if any
    if (element._observer) {
        element._observer.disconnect();
    }
    
    const observer = new MutationObserver(() => {
        if (element.innerText !== translatedText) {
            element.innerText = translatedText;
        }
    });

    observer.observe(element, { childList: true, subtree: true });
    element._observer = observer;
}

// Translation functionality
async function translateText(text) {
    if (!text || text.length < 2) return text;

    const isPersian = PERSIAN_REGEX.test(text);
    const prompt = isPersian 
        ? "Translate this text to English and just show output:" 
        : "Translate this text to Persian and just show output: ";

    try {
        const response = await fetch(`${CONFIG.API_URL}?key=${CONFIG.API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt + text }] }],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Translation API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    } catch (error) {
        console.error("Translation failed:", error);
        // Could show an error notification to user here
        return text;
    }
}

function updateElementWithTranslation(element, translatedText) {
    element.style.opacity = '0.5'; // Show loading state
    try {
        translatedText = translatedText.trim();
        const isRtl = RTL_REGEX.test(translatedText);
        
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
            element.value = translatedText;
            element.setAttribute("dir", isRtl ? "rtl" : "ltr");
            
            // Dispatch events
            const events = ['input', 'change'];
            events.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
        } else {
            element.innerText = translatedText;
            element.setAttribute("dir", isRtl ? "rtl" : "ltr");
            element.style.textAlign = isRtl ? "right" : "left";
            
            observeChanges(element, translatedText);
        }
    } finally {
        element.style.opacity = '1'; // Reset opacity
        cleanup();
    }
}

// Create translate icon
function createTranslateIcon(target) {
    const translateIcon = document.createElement("button");
    Object.assign(translateIcon.style, {
        position: "absolute",
        background: "white",
        border: "1px solid gray",
        borderRadius: "4px",
        padding: "2px 5px",
        fontSize: "12px",
        cursor: "pointer",
        zIndex: "1000"
    });
    
    translateIcon.innerText = "🌐";
    translateIcon.title = "Translate Text";

    const rect = target.getBoundingClientRect();
    translateIcon.style.top = `${window.scrollY + rect.top - 5}px`;
    translateIcon.style.left = `${window.scrollX + rect.left + rect.width + 5}px`;

    return translateIcon;
}

// Event Handlers
function handleMouseOver(event) {
    if (!state.selectionActive) return;
    cleanup();
    state.highlightedElement = event.target;
    state.highlightedElement.style.outline = "2px solid red";
}

async function handleClick(event) {
    const target = event.target;

    // حالت انتخاب فعال را مدیریت کن
    if (state.selectionActive) {
        state.selectionActive = false;
        if (!state.highlightedElement) return;
        state.highlightedElement.style.outline = "2px solid blue";
        const textToTranslate = state.highlightedElement.innerText.trim();
        if (!textToTranslate) return;
        const translatedText = await translateText(textToTranslate);
        if (translatedText) {
            updateElementWithTranslation(state.highlightedElement, translatedText);
        }
    }

    // شناسایی نوع عنصر
// شناسایی نوع عنصر
const isDraftJs = target.closest('.DraftEditor-root') !== null;
const isWhatsApp = target.closest('.selectable-text.copyable-text') !== null;
if (isDraftJs || isWhatsApp || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    cleanup();
    state.highlightedElement = target;

    // ایجاد آیکون ترجمه
    const translateIcon = createTranslateIcon(target);
    document.body.appendChild(translateIcon);
    state.activeTranslateIcon = translateIcon;

    let debounceTimeout;
    translateIcon.addEventListener("click", async () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(async () => {
            let textToTranslate;

            if (isDraftJs) {
                // برای Draft.js
                const tweetTextarea = target.closest('[data-testid="tweetTextarea_0"]');
                if (tweetTextarea) {
                    const textElements = tweetTextarea.querySelectorAll('[data-text="true"]');
                    textToTranslate = Array.from(textElements)
                        .map(el => el.textContent)
                        .join(' ')
                        .trim();
                }
            } else if (isWhatsApp) {
                // برای WhatsApp
                const container = target.closest('.selectable-text.copyable-text');
                if (container) {
                    const spanElement = container.querySelector('span[data-lexical-text="true"]');
                    if (spanElement) {
                        textToTranslate = spanElement.textContent.trim(); // استخراج متن از span
                        if (!textToTranslate) {
                            return;
                        }
                    } else {
                        return;
                    }
                }
            } else {
                // برای INPUT، TEXTAREA یا ContentEditable
                textToTranslate = target.value || target.innerText.trim();
            }

            // ترجمه متن
            try {
                const translatedText = await translateText(textToTranslate);
                if (!translatedText) {
                    return;
                }

                if (isWhatsApp) {
                    await handleWhatsAppTranslation(target, translatedText);
                } else if (target.isContentEditable) {
                    target.focus();
                    const range = document.createRange();
                    const selection = window.getSelection();
                    range.selectNodeContents(target);
                    range.deleteContents();
                    const textNode = document.createTextNode(translatedText);
                    range.insertNode(textNode);
                } else {
                    target.value = translatedText;
                }
            } catch (error) {
                return;
            }
        }, 500);
    });
} else {
    cleanup();
}

// تابع بهبود یافته برای مدیریت ترجمه در واتس‌اپ
async function handleWhatsAppTranslation(target, translatedText) {
    const container = target.querySelector('span.selectable-text.copyable-text.false[data-lexical-text="true"]');
    if (!container) return;
    
    try {
        // فوکوس روی کانتینر
        container.focus();
        
        // انتخاب تمام متن
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(container);
        selection.removeAllRanges();
        selection.addRange(range);

        container.textContent = translatedText;
        
        return;
    } catch (err) {
        console.warn("Error updating text:", err);
    }

    console.error("Failed to update text");
}
}


// Event Listeners
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "enable_selection") {
        state.selectionActive = true;
    }
});

document.addEventListener("mouseover", handleMouseOver);
document.addEventListener("click", handleClick);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        cleanup();
    }
});