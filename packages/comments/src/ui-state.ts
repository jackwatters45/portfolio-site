import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schedule from 'effect/Schedule';
import * as Stream from 'effect/Stream';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { useMemo } from 'react';
import type { Target } from './protocol';

interface UiState {
  mounted: boolean;
  active: boolean;
  picking: boolean;
  list: 'all' | null;
  settings: boolean;
  welcome: boolean;
  keyboardPicker: boolean;
  selected: Target | null;
  replyTo: { threadId: string; messageId: string } | null;
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

export function useCommentUi(presenceActive: boolean) {
  const model = useMemo(() => {
    const state = Atom.make<UiState>({
      mounted: false,
      active: false,
      picking: true,
      list: null,
      settings: false,
      welcome: false,
      keyboardPicker: false,
      selected: null,
      replyTo: null,
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

    return { state, notice };
  }, []);

  const [value, set] = useAtom(model.state);
  const setNotice = useAtomSet(model.notice);

  const presenceNow = useAtomValue(
    value.active || presenceActive ? clock : idleClock,
  );

  const actions = useMemo(() => {
    const field =
      <K extends keyof UiState>(key: K) =>
      (value: UiState[K] | ((previous: UiState[K]) => UiState[K])) =>
        set((state) => ({
          ...state,
          [key]: Predicate.isFunction(value) ? value(state[key]) : value,
        }));

    return {
      setMounted: field('mounted'),
      setActive: field('active'),
      setPicking: field('picking'),
      setList: field('list'),
      setSettings: field('settings'),
      setWelcome: field('welcome'),
      setKeyboardPicker: field('keyboardPicker'),
      setSelected: field('selected'),
      setReplyTo: field('replyTo'),
      setHover: field('hover'),
      setLayout: field('layout'),
      setKeyboardTarget: field('keyboardTarget'),
    };
  }, [set]);

  return { ...value, ...actions, setNotice, presenceNow };
}
