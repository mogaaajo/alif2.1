import test from 'node:test';
import assert from 'node:assert/strict';
import { followTranscript, initialPosition, createRecognitionSession, normalizeAr } from './recitationTracker.mjs';

const words = ['قل هو الله احد', 'الله الصمد', 'لم يلد ولم يولد', 'ولم يكن له كفوا احد']
  .flatMap((ayah, ai) => ayah.split(' ').map(text => ({ text, ai })));
const result = (text, isFinal = true) => Object.assign([{ transcript: text }], { isFinal });

test('continues through several recognition restarts', () => {
  let state = initialPosition();
  for (const text of ['قل هو الله احد', 'الله الصمد', 'لم يلد ولم يولد', 'ولم يكن له كفوا احد']) {
    state = createRecognitionSession(words, state)([result(text)]).committed;
  }
  assert.equal(state.revealed, words.length);
});
test('a pause with no new transcript preserves progress', () => {
  const state = initialPosition(6);
  assert.deepEqual(followTranscript(words, state, ''), state);
});
test('repeating the current ayah catches up and continues', () => {
  const state = followTranscript(words, initialPosition(8), 'لم يلد ولم يولد');
  assert.equal(state.revealed, 10);
});
test('repeating the previous ayah moves the cursor without hiding words', () => {
  const state = followTranscript(words, initialPosition(7), 'الله الصمد');
  assert.equal(state.cursor, 6);
  assert.equal(state.revealed, 7);
  assert.equal(followTranscript(words, state, 'لم يلد').revealed, 8);
});
test('a wrong word can be corrected without restarting', () => {
  let state = followTranscript(words, initialPosition(6), 'لن');
  assert.equal(state.revealed, 6);
  state = followTranscript(words, state, 'لم يلد');
  assert.equal(state.revealed, 8);
  assert.equal(state.heard, '');
});
test('does not skip a missing reference word', () => {
  assert.equal(followTranscript(words, initialPosition(6), 'يلد ولم يولد').revealed, 6);
});
test('revised interim results never commit a false reveal', () => {
  const consume = createRecognitionSession(words, initialPosition(6));
  assert.equal(consume([result('لم يلد', false)]).preview.cursor, 8);
  const revised = consume([result('لن', false)]);
  assert.equal(revised.committed.revealed, 6);
  assert.equal(revised.preview.cursor, 6);
  assert.equal(consume([result('لم يلد')]).committed.revealed, 8);
});
test('cumulative final results are not consumed twice', () => {
  const consume = createRecognitionSession(words, initialPosition());
  const first = result('قل هو الله احد');
  consume([first]);
  assert.equal(consume([first, result('الله الصمد')]).committed.revealed, 6);
  assert.equal(consume([first, result('الله الصمد')]).committed.revealed, 6);
});
test('normalizes Quranic marks without merging distinct consonants', () => {
  assert.equal(normalizeAr('ٱللَّهُۖ'), 'الله');
  assert.notEqual(normalizeAr('من'), normalizeAr('لم'));
});
test('a repeat anchor can span separate final results', () => {
  const consume = createRecognitionSession(words, initialPosition(8));
  consume([result('لم')]);
  const state = consume([result('لم'), result('يلد ولم يولد')]).committed;
  assert.equal(state.revealed, 10);
});
test('repeated phrases ahead do not pull the cursor backward', () => {
  const repeated = 'قل هو قل هو الله'.split(' ').map(text => ({text, ai: 0}));
  assert.equal(followTranscript(repeated, initialPosition(2), 'قل هو الله').revealed, 5);
});
test('a new session after manual reveal starts at that word', () => {
  assert.equal(createRecognitionSession(words, initialPosition(10))([result('ولم يكن')]).committed.revealed, 12);
});
