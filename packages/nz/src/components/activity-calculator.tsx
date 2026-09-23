import { useAtom, useAtomValue } from '@effect/atom-react';
import { Atom } from 'effect/unstable/reactivity';
import { useId, useMemo } from 'react';
import { activities, formatNZD, perPersonCents } from '../data/activity-costs';
import type { ActivityOption } from '../data/activity-costs';
import '../styles/activity-calculator.css';

export default function ActivityCalculator() {
  const id = useId();

  const model = useMemo(() => {
    const selection = Atom.make<ReadonlyMap<string, ActivityOption>>(new Map());

    const total = Atom.make((get) => {
      const options = [...get(selection).values()];

      return {
        cents: options.reduce((sum, option) => sum + perPersonCents(option), 0),
        count: options.length,
        from: options.some((option) => option.from),
      };
    });

    return { selection, total };
  }, []);

  const [selection, setSelection] = useAtom(model.selection);
  const total = useAtomValue(model.total);

  function choose(activityId: string, option: ActivityOption | undefined) {
    setSelection((previous) => {
      const next = new Map(previous);

      if (option) next.set(activityId, option);
      else next.delete(activityId);

      return next;
    });
  }

  return (
    <div className="activity-calculator">
      <p className="note" id={`${id}-basis`}>
        Estimates in New Zealand dollars (NZD) for one adult. Shared costs
        assume all seven people take part and split the cost equally.
      </p>
      <div className="calculator-summary">
        <output aria-live="polite" aria-atomic="true">
          <span className="calculator-caption">Estimated total</span>
          <strong>
            {total.from ? 'From ' : ''}
            {formatNZD(total.cents)}
          </strong>
          <span>
            per person · {total.count}{' '}
            {total.count === 1 ? 'activity' : 'activities'} selected
          </span>
        </output>
        <button
          type="button"
          disabled={total.count === 0}
          onClick={() => setSelection(new Map())}
        >
          Clear all
        </button>
      </div>
      <fieldset aria-describedby={`${id}-basis`}>
        <legend className="calculator-sr-only">Choose paid activities</legend>
        {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari needs this with list-style: none. */}
        <ul className="calculator-options" role="list">
          {activities.map((activity) => {
            const selected = selection.has(activity.id);
            const option = selection.get(activity.id) ?? activity.options[0];
            const inputId = `${id}-${activity.id}`;

            return (
              <li key={activity.id} data-selected={selected}>
                <label className="calculator-choice" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={selected}
                    aria-describedby={`${inputId}-price ${inputId}-details`}
                    onChange={(event) =>
                      choose(
                        activity.id,
                        event.currentTarget.checked ? option : undefined,
                      )
                    }
                  />
                  <span className="calculator-name">{activity.name}</span>
                  <span className="calculator-price" id={`${inputId}-price`}>
                    {option.from ? 'From ' : ''}
                    {formatNZD(perPersonCents(option))}
                    <small>
                      {option.basis === 'adult'
                        ? 'per adult'
                        : 'your 1/7 share'}
                    </small>
                  </span>
                </label>
                <div className="calculator-detail" id={`${inputId}-details`}>
                  {activity.options.length > 1 && (
                    <label className="calculator-variant">
                      <span>{activity.name} option</span>
                      <select
                        value={option.id}
                        disabled={!selected}
                        onChange={(event) => {
                          const next = activity.options.find(
                            (item) => item.id === event.currentTarget.value,
                          );

                          if (next) choose(activity.id, next);
                        }}
                      >
                        {activity.options.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.from ? 'from ' : ''}
                            {formatNZD(perPersonCents(item))}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {option.basis === 'seven-person-group' && (
                    <p>
                      {formatNZD(option.cents)} for the group ÷ 7; your share is
                      rounded to cents.
                    </p>
                  )}
                  {activity.note && <p>{activity.note}</p>}
                  <a
                    href={`/${activity.itinerary}`}
                    aria-label={`${activity.name}: itinerary details`}
                  >
                    Itinerary details
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p className="note calculator-limits">
        Based on itinerary research dated 22–23 September 2026, not held quotes.
        “From” prices use the advertised starting rate. No food, accommodation,
        general travel, fuel, card fees, or optional extras. Unpriced
        suggestions are not included. Selections reset when you reload.
      </p>
    </div>
  );
}
