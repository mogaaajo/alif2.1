import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MemorizeReveal from './MemorizeReveal';
import {logPracticeActivity} from '@/lib/api';

jest.mock('react-router-dom', () => ({
  Link: ({children}) => <div>{children}</div>, useParams: () => ({number: '112'}),
}), { virtual: true });
jest.mock('framer-motion', () => ({motion: {span: ({children, initial, animate, transition, ...props}) => <span {...props}>{children}</span>}}));
jest.mock('sonner', () => ({toast: {error: jest.fn()}}));
jest.mock('@/components/ui/button', () => ({Button: ({children, ...props}) => <button {...props}>{children}</button>}));
jest.mock('@/components/ui/progress', () => ({Progress: () => null}));
jest.mock('@/context/SettingsContext', () => ({useSettings: () => ({reciter: 'test', translation: 'test', arabicSize: 24})}));
jest.mock('@/lib/api', () => ({logPracticeActivity: jest.fn(async()=>({})), getSurah: async () => ({
  surah: {englishName: 'Al-Ikhlas'},
  ayahs: ['قل هو الله احد', 'الله الصمد', 'لم يلد ولم يولد', 'ولم يكن له كفوا احد']
    .map((arabic, i) => ({arabic, numberInSurah: i + 1})),
})}));

let instances, root, container;
class Recognition {
  constructor() { instances.push(this); }
  start() { this.onstart?.(); }
  abort() {}
  say(text) {
    this.onresult?.({results: [Object.assign([{transcript: text}], {isFinal: true})]});
  }
}
const click = async (id) => act(async () => container.querySelector(`[data-testid="${id}"]`).click());
beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
  instances = [];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.SpeechRecognition = Recognition;
  Element.prototype.scrollIntoView = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MemorizeReveal />));
  // Recognition assertions exercise the retained focused-learning view.
  await act(async () => container.querySelector('[data-testid="memorize-view-focus"]').click());
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete window.SpeechRecognition;
});

test('screen progresses through the third ayah across recognizer restarts', async () => {
  await click('memorize-mic-btn');
  await act(async () => instances.at(-1).say('قل هو الله احد'));
  expect(container.querySelector('[data-testid="reveal-word-3"]')).not.toBeNull();
  for (const text of ['الله الصمد', 'لم يلد ولم يولد']) {
    await act(async () => instances.at(-1).onend());
    expect(container.textContent).toContain('Reconnecting');
    await act(async () => jest.advanceTimersByTime(250));
    await act(async () => instances.at(-1).say(text));
  }
  expect(container.querySelector('[data-testid="reveal-word-9"]')).not.toBeNull();
});
test('stopping during reconnect prevents an unexpected microphone restart', async () => {
  await click('memorize-mic-btn');
  await act(async () => instances[0].onend());
  await click('memorize-mic-btn');
  await act(async () => jest.advanceTimersByTime(3000));
  expect(instances).toHaveLength(1);
});
test('manual reveal rebases the next recognition session and ignores stale results', async () => {
  await click('memorize-mic-btn');
  const stale = instances[0].onresult;
  await click('reveal-word-btn');
  expect(instances).toHaveLength(2);
  await act(async () => instances[1].say('هو الله احد'));
  expect(container.querySelector('[data-testid="reveal-word-3"]')).not.toBeNull();
  await act(async () => stale({results: [Object.assign([{transcript: 'قل'}], {isFinal: true})]}));
  expect(container.querySelector('[data-testid="reveal-word-3"]')).not.toBeNull();
});
test('network failure shows a persistent explanation instead of looping', async () => {
  await click('memorize-mic-btn');
  await act(async () => instances[0].onerror({error: 'network'}));
  expect(container.querySelector('[data-testid="recognition-error"]').textContent).toContain('network');
  expect(container.querySelector('[data-testid="recognition-error"]').textContent).toContain('Google Chrome');
  await act(async () => jest.advanceTimersByTime(10000));
  expect(instances).toHaveLength(1);
  await click('memorize-mic-btn');
  expect(instances).toHaveLength(2);
  expect(container.querySelector('[data-testid="recognition-error"]')).toBeNull();
});
test('ordinary silence does not exhaust the failure budget', async () => {
  await click('memorize-mic-btn');
  for (let i = 0; i < 7; i++) {
    await act(async () => {
      instances.at(-1).onerror({error: 'no-speech'});
      instances.at(-1).onend();
    });
    await act(async () => jest.advanceTimersByTime(1000));
  }
  expect(instances).toHaveLength(8);
  expect(container.querySelector('[data-testid="recognition-error"]')).toBeNull();
  await act(async () => instances.at(-1).say('قل هو الله احد'));
  expect(container.querySelector('[data-testid="reveal-word-3"]')).not.toBeNull();
});

 test('manual completion records assisted practice and its exact ayahs', async () => {
  logPracticeActivity.mockClear();
  await click('reveal-ayah-btn');
  expect(logPracticeActivity).toHaveBeenCalledWith(expect.objectContaining({kind:'assisted_practice',assisted:true,ayah_keys:['112:1','112:2','112:3','112:4']}));
 });
 test('Listen stops recognition and ignores audio feedback', async () => {
  await click('memorize-mic-btn');
  const stale = instances.at(-1).onresult;
  await click('memorize-listen-btn');
  await act(async()=>stale({results:[Object.assign([{transcript:'قل هو الله احد'}],{isFinal:true})]}));
  expect(container.querySelector('[data-testid="reveal-word-3"]')).toBeNull();
 });
