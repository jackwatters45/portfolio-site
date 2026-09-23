import { useForm } from '@tanstack/react-form';
import { useId } from 'react';
import { Icon } from './icons';
import { COLORS, NAME_LIMIT, validName } from './protocol';
import type { Preferences } from './use-preferences';

export function NameForm({
  name,
  onSave,
  welcome = false,
}: {
  name: string;
  onSave: (name: string) => void | Promise<void>;
  welcome?: boolean;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: { name },
    validators: {
      onChange: ({ value }) =>
        validName(value.name) ? undefined : 'Enter your name.',
      onSubmit: ({ value }): string | undefined =>
        validName(value.name) ? undefined : 'Enter your name.',
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSave(value.name.trim());
      } catch {
        formApi.setErrorMap({
          onSubmit: 'Could not save your name. Try again.',
        });
      }
    },
  });
  return (
    <form
      className="pc-name-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="pc-name-field">
            <label htmlFor={id}>{welcome ? 'Your name' : 'Name'}</label>
            <div className="pc-name-row">
              <input
                id={id}
                type="text"
                autoComplete="name"
                placeholder="First name"
                maxLength={NAME_LIMIT}
                required
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {!welcome && (
                <button
                  className="pc-icon-button"
                  type="submit"
                  aria-label="Save name"
                >
                  <Icon name="check" size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
        {(error) =>
          error ? (
            <p className="pc-error" role="alert">
              {error}
            </p>
          ) : null
        }
      </form.Subscribe>
      {welcome && (
        <form.Subscribe selector={(state) => state.values.name}>
          {(name) => (
            <button
              className="pc-primary pc-join"
              type="submit"
              disabled={!validName(name)}
            >
              Continue
              <Icon name="arrow" size={14} />
            </button>
          )}
        </form.Subscribe>
      )}
    </form>
  );
}
export function Settings({
  preferences,
  update,
}: {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
}) {
  return (
    <div className="pc-settings-content">
      <NameForm name={preferences.name} onSave={(name) => update({ name })} />
      <fieldset className="pc-settings-field">
        <legend>Cursor color</legend>
        <div className="pc-colors">
          {COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              style={{ background: color }}
              aria-label={
                ['Blue', 'Rose', 'Teal', 'Amber', 'Purple', 'Orange'][index]
              }
              aria-pressed={preferences.color === color}
              onClick={() => update({ color })}
            >
              {preferences.color === color && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="pc-setting-toggle">
        <span>Comment markers</span>
        <input
          type="checkbox"
          checked={preferences.markers}
          onChange={(event) => update({ markers: event.target.checked })}
        />
      </label>
    </div>
  );
}
