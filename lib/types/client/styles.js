/**
 * The section's stylesheet, injected as one `<style>` tag by the client
 * plugin (no CSS pipeline in this standalone build). All classes carry the
 * `protocom-` prefix.
 */
export const SECTION_CSS = `
.protocom-section { display: flex; flex-direction: column; gap: 18px; max-width: 780px; }
.protocom-title { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.01em; }
.protocom-intro { margin: -6px 0 0; font-size: 13px; line-height: 1.55; opacity: 0.72; }
.protocom-notice { margin: 0; font-size: 12px; opacity: 0.7; }
.protocom-error { margin: 0; font-size: 12px; color: var(--dsh-danger, #d03050); }
.protocom-status { margin: 0; font-size: 12px; color: var(--dsh-success, #18a058); }
.protocom-advanced summary { cursor: pointer; font-size: 13px; opacity: 0.8; width: fit-content; }
.protocom-advanced-body { display: flex; gap: 8px; align-items: center; margin-top: 8px; }

.protocom-groups { display: flex; flex-direction: column; gap: 14px; list-style: none; margin: 0; padding: 0; }
.protocom-card {
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  border-radius: 12px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
  background: var(--dsh-card, rgba(128, 128, 128, 0.045));
  transition: border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-card:hover { border-color: var(--dsh-border-strong, rgba(128, 128, 128, 0.38)); }
.protocom-card.is-off > :not(.protocom-card-head) { opacity: 0.55; }

.protocom-card-head { display: flex; align-items: center; gap: 8px; }
.protocom-card-name { font-size: 14.5px; font-weight: 600; }
.protocom-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--dsh-badge, rgba(128, 128, 128, 0.16)); opacity: 0.85; }
.protocom-head-state { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 12px; opacity: 0.85; }
.protocom-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsh-muted, #999); flex: none; }
.protocom-dot.is-on { background: var(--dsh-success, #18a058); }

.protocom-switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.protocom-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-switch-track {
  width: 34px; height: 20px; border-radius: 999px; flex: none; position: relative;
  background: var(--dsh-border, rgba(128, 128, 128, 0.4));
  transition: background 0.15s ease;
}
.protocom-switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease;
}
.protocom-switch input:checked + .protocom-switch-track { background: var(--dsh-accent, #3a7bfd); }
.protocom-switch input:checked + .protocom-switch-track .protocom-switch-thumb { transform: translateX(14px); }
.protocom-switch input:focus-visible + .protocom-switch-track { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: 2px; }
.protocom-switch input:disabled + .protocom-switch-track { opacity: 0.5; }

.protocom-field { display: flex; align-items: center; gap: 8px; }
.protocom-field-label { font-size: 12px; min-width: 64px; opacity: 0.7; }
.protocom-input {
  flex: 1; font-size: 13px; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: var(--dsh-input, transparent); color: inherit;
  transition: border-color 0.15s ease;
}
.protocom-input:focus { outline: none; border-color: var(--dsh-accent, #3a7bfd); }
.protocom-key-state { font-size: 11px; opacity: 0.62; margin-top: -7px; }

.protocom-button {
  font-size: 12px; padding: 5px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-button:hover:not(:disabled) { background: var(--dsh-hover, rgba(128, 128, 128, 0.12)); }
.protocom-button:disabled { opacity: 0.5; cursor: default; }
.protocom-button-primary { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }
.protocom-button-primary:hover:not(:disabled) { background: var(--dsh-accent-hover, #2f6ae0); }

.protocom-probe-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.protocom-probe-table th, .protocom-probe-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.16)); }
.protocom-probe-table th { opacity: 0.62; font-weight: 500; font-size: 12px; }
.protocom-probe-table tbody tr:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.07)); }
.protocom-probe-id { font-family: ui-monospace, monospace; font-size: 11.5px; opacity: 0.62; }

.protocom-chip {
  display: inline-flex; align-items: center; margin: 2px 6px 2px 0; padding: 2px 10px;
  font-size: 11.5px; border-radius: 999px; cursor: pointer; user-select: none;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.protocom-chip input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-chip:hover { border-color: var(--dsh-accent, #3a7bfd); }
.protocom-chip.is-on { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }

.protocom-card-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.protocom-card-toggle:hover .protocom-card-name { color: var(--dsh-accent, #3a7bfd); }
.protocom-caret { width: 10px; text-align: center; font-size: 10px; opacity: 0.5; }
.protocom-card-body { display: flex; flex-direction: column; gap: 12px; }
.protocom-models-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.protocom-models-title { font-size: 12.5px; font-weight: 600; }
.protocom-models-count { font-size: 11.5px; opacity: 0.6; font-variant-numeric: tabular-nums; }
.protocom-vision {
  font-size: 11px; padding: 2px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit; opacity: 0.55;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.protocom-vision.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-vision:disabled { cursor: default; opacity: 0.4; }

/* The one bounded viewport in a card: a group may contribute hundreds of menu
   entries, and the card must not grow with them. */
.protocom-models { display: flex; flex-direction: column; gap: 1px; max-height: 340px; min-height: 44px; overflow-y: auto; }
.protocom-model-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 5px 8px; border-radius: 9px;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.protocom-model-row:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.09)); }
.protocom-model-row.is-off { opacity: 0.42; }
.protocom-model-pick { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.protocom-model-row input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-model-row:focus-within { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: -2px; }
.protocom-model-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  border: 1.5px solid var(--dsh-border, rgba(128, 128, 128, 0.5));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.protocom-model-row:not(.is-off) .protocom-model-dot { background: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-model-name { font-size: 12.5px; font-weight: 500; }
.protocom-model-row.is-off .protocom-model-name { text-decoration: line-through; }
.protocom-model-meta { font-size: 11px; opacity: 0.6; letter-spacing: 0.02em; }
.protocom-model-spacer { flex: 1 1 12px; }
.protocom-model-star {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 12px; line-height: 1; padding: 3px 5px; border-radius: 50%;
  opacity: 0.3; transition: opacity 0.15s ease, color 0.15s ease;
}
.protocom-model-star:hover:not(:disabled) { opacity: 0.75; }
.protocom-model-star.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); }
.protocom-model-star:disabled { cursor: default; }

.protocom-ctx { display: inline-flex; border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35)); border-radius: 999px; overflow: hidden; }
.protocom-ctx button {
  border: 0; border-right: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  background: transparent; color: inherit; cursor: pointer;
  font-size: 11px; padding: 3px 10px; font-variant-numeric: tabular-nums;
  transition: background 0.15s ease, color 0.15s ease;
}
.protocom-ctx button:last-child { border-right: 0; }
.protocom-ctx button:hover:not(:disabled):not(.is-on) { background: var(--dsh-hover, rgba(128, 128, 128, 0.16)); }
.protocom-ctx button.is-on { background: var(--dsh-accent, #3a7bfd); color: #fff; }
.protocom-ctx button:disabled { cursor: default; }
.protocom-ctx button.is-on:disabled { opacity: 0.9; }

.protocom-balance { border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25)); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.protocom-balance-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; }
.protocom-quota { display: flex; flex-direction: column; gap: 6px; }
.protocom-quota-hero { font-size: 18px; font-weight: 650; }
.protocom-quota-hero small { font-size: 12px; font-weight: 400; opacity: 0.6; margin-left: 6px; }
.protocom-quota-bar { height: 6px; border-radius: 999px; background: var(--dsh-track, rgba(128, 128, 128, 0.18)); overflow: hidden; }
.protocom-quota-fill { height: 100%; border-radius: 999px; background: var(--dsh-accent, #3a7bfd); transition: width 0.3s ease; }
.protocom-quota-fill.is-warn { background: var(--dsh-danger, #d03050); }
.protocom-balance-grid { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; }
.protocom-balance-item { opacity: 0.82; }
.protocom-balance-item b { font-weight: 600; }
`;
