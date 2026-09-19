/**
 * The section's stylesheet, injected as one `<style>` tag by the client
 * plugin (no CSS pipeline in this standalone build). All classes carry the
 * `protocom-` prefix.
 */

export const SECTION_CSS = `
.protocom-section { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
.protocom-title { margin: 0; font-size: 18px; font-weight: 600; }
.protocom-intro { margin: 0; opacity: 0.75; font-size: 13px; }
.protocom-notice { margin: 0; font-size: 12px; opacity: 0.7; }
.protocom-error { margin: 0; font-size: 12px; color: var(--dsh-danger, #d03050); }
.protocom-status { margin: 0; font-size: 12px; color: var(--dsh-success, #18a058); }
.protocom-advanced summary { cursor: pointer; font-size: 13px; opacity: 0.8; }
.protocom-advanced-body { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.protocom-groups { display: flex; flex-direction: column; gap: 12px; list-style: none; margin: 0; padding: 0; }
.protocom-card { border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.25)); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.protocom-card-head { display: flex; align-items: center; gap: 8px; }
.protocom-card-name { font-size: 14px; font-weight: 600; }
.protocom-tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--dsh-badge, rgba(128, 128, 128, 0.18)); }
.protocom-card-head .protocom-toggle { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; }
.protocom-field { display: flex; align-items: center; gap: 8px; }
.protocom-field-label { font-size: 12px; min-width: 72px; opacity: 0.75; }
.protocom-input { flex: 1; font-size: 13px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35)); background: transparent; color: inherit; }
.protocom-button { font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35)); background: transparent; color: inherit; cursor: pointer; }
.protocom-button:hover:not(:disabled) { background: var(--dsh-hover, rgba(128, 128, 128, 0.12)); }
.protocom-button:disabled { opacity: 0.5; cursor: default; }
.protocom-key-state { font-size: 11px; opacity: 0.7; }
.protocom-probe-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.protocom-probe-table th, .protocom-probe-table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.18)); }
.protocom-probe-table th { opacity: 0.7; font-weight: 500; }
.protocom-variant { display: inline-flex; align-items: center; gap: 3px; margin-right: 10px; font-size: 12px; white-space: nowrap; }
.protocom-balance { border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25)); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.protocom-balance-head { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
.protocom-balance-grid { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; }
.protocom-balance-item { opacity: 0.85; }
.protocom-balance-item b { font-weight: 600; }
`
