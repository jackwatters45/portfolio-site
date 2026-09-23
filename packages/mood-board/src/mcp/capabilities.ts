import { Schema } from 'effect';

export const CapabilityModeSchema = Schema.Literals([
  'persisted-content',
  'explicit-targeting',
  'render-only',
  'static-output',
  'new-revision',
  'unsupported',
]);

export const BoardCapabilitySchema = Schema.Struct({
  feature: Schema.String,
  mode: CapabilityModeSchema,
  description: Schema.String,
});

/** Account content operations never control an open browser editor. */
export const boardCapabilities: ReadonlyArray<
  typeof BoardCapabilitySchema.Type
> = [
  {
    feature: 'items, backgrounds, layouts, shuffle, layers, annotations, links',
    mode: 'persisted-content',
    description: 'Changes board content through revision-checked mutations.',
  },
  {
    feature: 'selection',
    mode: 'explicit-targeting',
    description:
      'Commands use explicit item IDs. They do not read or change browser selection.',
  },
  {
    feature: 'camera',
    mode: 'render-only',
    description:
      'Local archives store camera settings for import. Static previews fit the board automatically. Account tools cannot change an open editor viewport.',
  },
  {
    feature: 'presentation',
    mode: 'static-output',
    description:
      'Produces bounded static previews, not an interactive presentation or live external embeds.',
  },
  {
    feature: 'checkpoint restore',
    mode: 'new-revision',
    description:
      'Restores saved content as a new guarded revision. Does not rewind revisions or browser undo history.',
  },
  {
    feature: 'browser playback and control',
    mode: 'unsupported',
    description:
      'Cannot play audio or video, control embeds, pan an open editor, enter fullscreen, or execute browser undo and redo.',
  },
];
