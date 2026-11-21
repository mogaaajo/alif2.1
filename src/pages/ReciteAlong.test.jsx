import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ReciteAlong from './ReciteAlong';
import {submitRecitation, logPracticeActivity} from '@/lib/api';
import {AUTOMATED_ASSESSMENT_ENABLED, getVerifiedScore} from '@/lib/assessment';

const mockNavigate = jest.fn();
jest.mock('react-router-dom',()=>({Link:({children})=><div>{children}</div>,useParams:()=>({number:'112'}),useNavigate:()=>mockNavigate}),{virtual:true});
jest.mock('framer-motion',()=>({AnimatePresence:({children})=><>{children}</>,motion:{div:({children,initial,animate,exit,transition,...props})=><div {...props}>{children}</div>}}));
jest.mock('sonner',()=>({toast:{error:jest.fn(),info:jest.fn()}}));
jest.mock('@/context/SettingsContext',()=>({useSettings:()=>({reciter:'a',translation:'en',reciters:[{identifier:'a',englishName:'Reciter A'}]})}));
jest.mock('@/lib/preload',()=>({preloadAudio:jest.fn()}));
jest.mock('@/lib/user',()=>({getUserId:()=> 'test-user'}));
jest.mock('@/context/PlaybackContext',()=>({usePlayback:()=>({stop:jest.fn()})}));
jest.mock('@/lib/api',()=>({
  getPageAudio:async()=>({ayahs:[{surahNumber:112,numberInSurah:4,arabic:"first",page:604},{surahNumber:113,numberInSurah:1,arabic:"second",page:604}]}),
  getSurah:async()=>({surah:{englishName:'Al-Ikhlas'},ayahs:[1,2,3,4].map(numberInSurah=>({numberInSurah,arabic:'test '+numberInSurah}))}),
  getMultiAudio:async(id)=>({ayahs:[1,2,3,4].map(i=>({audios:{a:id===113?'/113/'+i:'/a/'+i}}))}),
  submitRecitation:jest.fn(),
  logPracticeActivity:jest.fn(async()=>({xp_earned:15})),
}));
jest.mock('@/components/ui/button',()=>({Button:({children,...p})=><button {...p}>{children}</button>}));
jest.mock('@/components/ui/progress',()=>({Progress:()=>null}));
jest.mock('@/components/ui/slider',()=>({Slider:()=>null}));
jest.mock('@/components/ui/switch',()=>({Switch:({checked,onCheckedChange,...p})=><input type="checkbox" checked={checked} onChange={e=>onCheckedChange?.(e.target.checked)} {...p}/>}));
jest.mock('@/components/ui/select',()=>({Select:({children})=><div>{children}</div>,SelectTrigger:({children})=><div>{children}</div>,SelectValue:()=>null,SelectContent:()=>null,SelectItem:()=>null}));
jest.mock('@/components/PracticeScopePicker',()=>({__esModule:true,default:({onValueChange,onStartChange})=><button data-testid="test-page-scope" onClick={()=>{onValueChange('page');onStartChange(604);}}>Page</button>}));
let root, container, recorders, stopTrack;
class Recorder {
  constructor(){this.state='inactive';this.mimeType='audio/mp4';recorders.push(this);}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:this.mimeType})});this.onstop?.();}
}
beforeEach(async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  recorders=[];stopTrack=jest.fn();global.MediaRecorder=Recorder;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:jest.fn(async()=>({getTracks:()=>[{stop:stopTrack}]}))}});
  jest.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  submitRecitation.mockReset();
  logPracticeActivity.mockClear();
  mockNavigate.mockClear();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>root.render(<ReciteAlong/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.restoreAllMocks();delete global.MediaRecorder;});
const click=id=>act(async()=>container.querySelector('[data-testid="'+id+'"]').click());

test('automated assessment fails closed for legacy and forged numeric responses',()=>{
  expect(AUTOMATED_ASSESSMENT_ENABLED).toBe(false);
  expect(getVerifiedScore({score:20})).toBeNull();
  expect(getVerifiedScore({score:60})).toBeNull();
  expect(getVerifiedScore({score:90})).toBeNull();
  expect(getVerifiedScore({available:true,score_verified:true,score:95})).toBeNull();
  expect(getVerifiedScore({score:0,summary:'Could not evaluate the recitation. Service unavailable'})).toBeNull();
});

test('setup starts practice in Mushaf mode without uploading audio or grading',async()=>{
  await click('start-along-btn');
  expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/mushaf\/\d+\?mode=along$/));
  expect(submitRecitation).not.toHaveBeenCalled();
});

test('page scope start routes to the selected Mushaf page in along mode',async()=>{
  await click('test-page-scope');
  await click('start-along-btn');
  expect(mockNavigate).toHaveBeenCalledWith('/mushaf/604?mode=along');
  expect(submitRecitation).not.toHaveBeenCalled();
});

test('setup preserves hands-free default and allows switching to manual mode',async()=>{
  expect(container.querySelector('[data-testid="along-handsfree-info"]')).not.toBeNull();
  await click('mode-manual-btn');
  await click('mode-handsfree-btn');
  expect(submitRecitation).not.toHaveBeenCalled();
});

