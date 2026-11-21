import {playbackStart} from '@/lib/practiceSession';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import StickyAudioPlayer from './StickyAudioPlayer';
import {PlaybackProvider, usePlayback} from '@/context/PlaybackContext';
import {appendAyahWithBasmala, separateBasmala} from '@/lib/basmala';

jest.mock('react-router-dom', () => ({useNavigate: () => jest.fn(), useLocation: () => ({pathname:'/surah/112'})}), {virtual:true});
jest.mock('@/context/SettingsContext', () => ({useSettings: () => ({repeatEach: 1})}));
jest.mock('@/lib/api', () => ({API:'/api'}));
jest.mock('@/lib/preload', () => ({preloadAudio: jest.fn()}));
jest.mock('@/components/ui/button', () => ({Button: ({children, ...props}) => <button {...props}>{children}</button>}));
jest.mock('@/components/ui/slider', () => ({Slider: () => null}));
jest.mock('@/components/ui/label', () => ({Label: ({children}) => <span>{children}</span>}));
jest.mock('@/components/ui/input', () => ({Input: () => null}));
jest.mock('@/components/ui/popover', () => ({Popover: ({children}) => <div>{children}</div>, PopoverTrigger: ({children}) => <div>{children}</div>, PopoverContent: () => null}));

const queue = [112,113,114].flatMap(surahNumber => [1,2].map(numberInSurah => ({
  surahNumber, numberInSurah, surahName: String(surahNumber), audio:`https://cdn.islamic.network/${surahNumber}-${numberInSurah}.mp3`,
})));
let controls, root, container, play;
function Harness() { controls = usePlayback(); return <StickyAudioPlayer/>; }
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PlaybackProvider><Harness/></PlaybackProvider>));
});
afterEach(async () => {await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks();});
const start = () => act(async () => controls.playQueue(queue, 0, 'Next 3 surahs'));
const ended = () => act(async () => container.querySelector('audio').dispatchEvent(new Event('ended')));

test('automatically advances all items across three surahs and stops at the end', async () => {
  await start();
  for (let i=1;i<queue.length;i++) {await ended(); expect(controls.index).toBe(i); expect(controls.isPlaying).toBe(true);}
  await ended(); expect(controls.isPlaying).toBe(false); expect(controls.index).toBe(queue.length-1);
});
test('a rejected old play request cannot pause the next ayah', async () => {
  let rejectOld;
  play.mockImplementationOnce(() => new Promise((resolve,reject) => {rejectOld=reject;}));
  await start();
  await act(async () => controls.next());
  await act(async () => rejectOld(new DOMException('Old source interrupted', 'AbortError')));
  expect(controls.index).toBe(1);
  expect(controls.isPlaying).toBe(true);
});
test('clearing and starting again retains the audio element used by the effects graph', async () => {
  await start(); const original=container.querySelector('audio');
  await act(async () => controls.clear());
  await start(); expect(container.querySelector('audio')).toBe(original);
});
test('pausing and resuming does not assign the relative audio source again', async () => {
  await start();
  const audio=container.querySelector('audio');
  const setSource=jest.spyOn(audio,'src','set');
  await act(async () => controls.toggle());
  await act(async () => controls.toggle());
  expect(setSource).not.toHaveBeenCalled();
});
test('current play failures show a retry message and preserve the queue', async () => {
  play.mockRejectedValueOnce(new DOMException('Needs gesture', 'NotAllowedError'));
  await start();
  expect(controls.isPlaying).toBe(false);
  expect(controls.index).toBe(0);
  expect(container.querySelector('[data-testid="playback-error"]').textContent).toContain('Press Play');
  await act(async () => controls.toggle());
  expect(controls.isPlaying).toBe(true);
  expect(container.querySelector('[data-testid="playback-error"]')).toBeNull();
});
test('adds Bismillah before a non-exempt surah and keeps it out of ayah one', () => {
  const items=[];
  appendAyahWithBasmala(items, {surahNumber:112, surahName:'Al-Ikhlas', basmalaAudio:'/basmala.mp3', ayah:{numberInSurah:1,arabic:'قُلْ هُوَ ٱللَّهُ أَحَدٌ',audio:'/112-1.mp3'}});
  expect(items.map((item)=>item.numberInSurah)).toEqual([0,1]);
  expect(items[0]).toMatchObject({isBasmala:true, audio:'/basmala.mp3'});
  const tawbah=[];
  appendAyahWithBasmala(tawbah, {surahNumber:9, surahName:'At-Tawbah', basmalaAudio:'/basmala.mp3', ayah:{numberInSurah:1,arabic:'بَرَاءَةٌ',audio:'/9-1.mp3'}});
  expect(tawbah.map((item)=>item.numberInSurah)).toEqual([1]);
});

test('separates the opening Bismillah without changing Fatiha or later ayahs', () => {
 const text='بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ يَا أَيُّهَا الْكَافِرُونَ';
 const data={ayahs:[{numberInSurah:1,arabic:text,segments:[{text:text.slice(0,12),rule:'ghunnah'},{text:text.slice(12)}]}]};
 const cleaned=separateBasmala(data,109).ayahs[0];
 expect(cleaned.arabic).toBe('قُلْ يَا أَيُّهَا الْكَافِرُونَ');
 expect(cleaned.segments.map(s=>s.text).join('')).toBe(cleaned.arabic);
 expect(separateBasmala(data,1).ayahs[0].arabic).toBe(text);
 expect(separateBasmala(data,9).ayahs[0].arabic).toBe(text);
 expect(separateBasmala({ayahs:[{numberInSurah:2,arabic:text}]},109).ayahs[0].arabic).toBe(text);
});

test('surah start includes its Bismillah but a middle ayah starts directly',()=>{
 const items=[{surahNumber:2,isBasmala:true},{surahNumber:2,numberInSurah:1},{surahNumber:2,numberInSurah:2}];
 expect(playbackStart(items,2,1)).toBe(0);expect(playbackStart(items,2,2)).toBe(2);
 expect(playbackStart([{surahNumber:9,numberInSurah:1}],9,1)).toBe(0);
});
