# Problem Report: Linguistic Fragmentation in Translation Logic

## 1. The Core Issue: "Atomic" Extraction
The extension currently uses a **Node-Level (Atomic)** extraction strategy. It treats every single HTML text node as an independent entity, completely unaware of its surrounding grammatical context.

### Technical Breakdown:
In `domManipulation.js`, the `TreeWalker` is configured to stop at every `NodeFilter.SHOW_TEXT`. 
When it encounters a structured sentence like:
`The quick <b>brown</b> fox <a>jumps</a> over the dog.`

**The extension extracts it as five separate strings:**
1. `"The quick "`
2. `"brown"`
3. `" fox "`
4. `"jumps"`
5. `" over the dog."`

## 2. Why This Destroys Translation Quality

### A. Loss of Context (LLMs & NMT)
Whether using **Gemini (AI)** or **Google Translate (NMT)**, the engine receives these fragments one by one. 
- The translator doesn't know that "brown" is an adjective modifying "fox".
- In languages like **Persian (FA)**, where word order and verb conjugation depend on the entire sentence structure, translating fragments results in "word-for-word" substitution rather than natural translation.

### B. Broken Syntax in RTL Languages
Since Persian is a Right-to-Left (RTL) language, translating fragments and then reassembling them in the original DOM order often causes:
- **Incorrect Word Order:** The verb or subject might end up in the wrong place because the translator didn't see the whole sentence.
- **Gender/Number Mismatch:** Adjectives cannot be correctly inflected because they are separated from their nouns.

### C. Structural "Hallucination" by Translators
When Google Translate receives a single word like "Lead", it doesn't know if it's a verb (to guide) or a noun (the metal). Without the rest of the sentence, it guesses, and 50% of the time, the guess is wrong for the specific webpage context.

## 3. The "Spacing" Symptom
The existence of `spacingUtils.js` is a direct symptom of this problem. The code tries to manually fix "stuck words" (e.g., `brownfox`) because the fragments lost their natural spacing during the isolated translation process.

## 4. Summary of Failures
* **GitHub/Technical Docs:** These sites use many `<code>`, `<em>`, and `<a>` tags. The current logic breaks every technical sentence into 10+ fragments, making the translation unreadable.
* **Translation Providers:**
    * **Google Translate:** Joins fragments with `\n`, causing it to treat them as a list of items rather than a paragraph.
    * **AI Providers:** Lose their "reasoning" capability because they are forced to translate snippets instead of ideas.

## 5. Conclusion
The problem is not the **Quality of the Translator**, but the **Granularity of the Data** being sent. The system is translating "nodes" instead of "messages."
