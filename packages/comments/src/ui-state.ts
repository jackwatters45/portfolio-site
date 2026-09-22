import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import * as Clipboard from '@effect/platform-browser/Clipboard';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import * as Stream from 'effect/Stream';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { useMemo } from 'react';
import type { Target } from './protocol';

export type Selection =
  | { kind: 'new'; target: Target }
  | { kind: 'thread'; id: string };
interface UiState {
  mounted: boolean;
  active: boolean;
  picking: boolean;
  showCards: boolean;
  settings: boolean;
  welcome: boolean;
  keyboardPicker: boolean;
  selected: Selection | null;
  hover: Target | null;
  notice: string;
  layout: number;
  keyboardTarget: string;
}
const clock = Atom.make(
  Stream.fromSchedule(Schedule.spaced('1 second')).pipe(
    Stream.mapEffect(() => Clock.currentTimeMillis),
  ),
  { initialValue: 0 },
).pipe(Atom.map(AsyncResult.getOrElse(() => 0)));
const idleClock = Atom.make(0);

export function useCommentUi() {
  const model = useMemo(() => {
    const state = Atom.make<UiState>({
      mounted: false,
      active: false,
      picking: true,
      showCards: false,
      settings: false,
      welcome: false,
      keyboardPicker: false,
      selected: null,
      hover: null,
      notice: '',
      layout: 0,
      keyboardTarget: '',
    });
    const notice = Atom.fn((notice: string, get) =>
      Effect.gen(function* () {
        get.set(state, { ...get(state), notice });
        yield* Effect.sleep('5 seconds');
        get.set(state, { ...get(state), notice: '' });
      }),
    );
    const copy = Atom.fn((url: string, get) =>
      Clipboard.Clipboard.use((clipboard) => clipboard.writeString(url)).pipe(
        Effect.as('Comment link copied'),
        Effect.catchTag('ClipboardError', () => Effect.succeed(url)),
        Effect.tap((message) => Effect.sync(() => get.set(notice, message))),
        Effect.provide(Clipboard.layer),
      ),
    );
    return { state, notice, copy };
  }, []);
  const [value, set] = useAtom(model.state);
  const setNotice = useAtomSet(model.notice);
  const copyLink = useAtomSet(model.copy);
  const presenceNow = useAtomValue(value.active ? clock : idleClock);
  const actions = useMemo(() => {
    const field =
      <K extends keyof UiState>(key: K) =>
      (value: UiState[K] | ((previous: UiState[K]) => UiState[K])) =>
        set((state) => ({
          ...state,
          [key]: typeof value === 'function' ? value(state[key]) : value,
        }));
    return {
      setMounted: field('mounted'),
      setActive: field('active'),
      setPicking: field('picking'),
      setShowCards: field('showCards'),
      setSettings: field('settings'),
      setWelcome: field('welcome'),
      setKeyboardPicker: field('keyboardPicker'),
      setSelected: field('selected'),
      setHover: field('hover'),
      setLayout: field('layout'),
      setKeyboardTarget: field('keyboardTarget'),
    };
  }, [set]);
  return { ...value, ...actions, setNotice, copyLink, presenceNow };
}
