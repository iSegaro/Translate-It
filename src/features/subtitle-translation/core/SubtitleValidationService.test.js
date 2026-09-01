import { describe, it, expect } from 'vitest';
import { SubtitleValidationService } from './SubtitleValidationService.js';
import { subtitleTextProtector } from '../formatting/SubtitleTextProtector.js';
import { SrtAdapter } from '../parsers/SrtAdapter.js';

function createCue(id, text, translatedText = undefined) {
  return {
    id,
    index: 1,
    startTime: '00:00:01,000',
    endTime: '00:00:02,000',
    text,
    translatedText,
    status: 'pending',
    warnings: []
  };
}

function validateCue(cue, rawTranslation) {
  const { tokens } = subtitleTextProtector.protect(cue.text);
  return SubtitleValidationService.validateAndRestore(
    [cue],
    [rawTranslation],
    new Map([[cue.id, tokens]])
  );
}

describe('SubtitleValidationService', () => {
  it('restores intact HTML tokens and accepts the translation', () => {
    const cue = createCue('html-intact', '<i>Hello</i>');

    validateCue(cue, {
      id: cue.id,
      text: '@@SUB_TAG_0@@Translated@@SUB_TAG_1@@'
    });

    expect(cue.status).toBe('translated');
    expect(cue.translatedText).toBe('<i>Translated</i>');
  });

  it('accepts provider token spacing that existing normalization can recover', () => {
    const cue = createCue('mangled', '<i>Hello</i>');
    const rawTranslation = '@@ SUB_TAG_0 @ @Translated@ @ SUB_TAG_1@ @';

    validateCue(cue, rawTranslation);

    expect(cue.status).toBe('translated');
    expect(cue.translatedText).toBe('<i>Translated</i>');
  });

  it.each([
    ['html', '<i>Hello</i>', '@@SUB_TAG_0@@Translated', '@@SUB_TAG_1@@'],
    ['style', '{\\an8}Hello', 'Translated', '@@SUB_STY_0@@'],
    ['newline', 'Line 1\nLine 2', 'Translated', '@@SUB_NL_0@@']
  ])('fails when %s token is missing and preserves source text', (_name, sourceText, rawTranslation, missingToken) => {
    const cue = createCue(`missing-${_name}`, sourceText, 'stale translation');

    const { validatedCues } = validateCue(cue, rawTranslation);

    expect(cue.status).toBe('failed');
    expect(cue.translatedText).toBe('');
    expect(cue.text).toBe(sourceText);
    expect(cue.warnings).toContain(`Missing formatting tokens: ${missingToken}`);
    expect(validatedCues).toContain(cue);
  });

  it('continues validating remaining cues after one cue loses a token', () => {
    const cues = [
      createCue('valid-a', '<i>A</i>'),
      createCue('corrupt-b', '{\\an8}B'),
      createCue('valid-c', 'C\nD')
    ];
    const tokenRegistry = new Map(cues.map(cue => [cue.id, subtitleTextProtector.protect(cue.text).tokens]));

    const { validatedCues } = SubtitleValidationService.validateAndRestore(
      cues,
      [
        { id: 'valid-a', text: '@@SUB_TAG_0@@A translated@@SUB_TAG_1@@' },
        { id: 'corrupt-b', text: 'B translated' },
        { id: 'valid-c', text: 'C translated@@SUB_NL_0@@D translated' }
      ],
      tokenRegistry
    );

    expect(validatedCues).toHaveLength(3);
    expect(cues.map(cue => cue.status)).toEqual(['translated', 'failed', 'translated']);
    expect(cues[0].translatedText).toBe('<i>A translated</i>');
    expect(cues[1].translatedText).toBe('');
    expect(cues[1].text).toBe('{\\an8}B');
    expect(cues[2].translatedText).toBe('C translated\nD translated');
  });

  it('serializes failed cues with original text and translated cues with translated text', () => {
    const cues = [
      createCue('failed', '<i>Original</i>'),
      createCue('translated', 'Source')
    ];
    cues[0].status = 'failed';
    cues[0].translatedText = '';
    cues[1].index = 2;
    cues[1].status = 'translated';
    cues[1].translatedText = 'Translated';

    const serialized = new SrtAdapter().serialize(cues);

    expect(serialized).toContain('<i>Original</i>');
    expect(serialized).toContain('Translated');
    expect(serialized).not.toContain('undefined');
  });
});
