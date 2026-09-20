/**
 * Opt-in wire capture for diagnosing an upstream rejection. Nothing is written
 * unless DSH_PROTOCOM_CAPTURE_DIR names a directory, so a normal deployment has
 * no extra I/O and no extra on-disk copies of anything.
 *
 * Request *bodies* and upstream *error* bodies are captured; headers are never
 * written, so no credential can reach the files. Bodies do contain the
 * conversation (including tool results), which is why the switch is explicit
 * and per-process rather than a stored setting.
 *
 * @module dsh-protocom-api/capture
 */
/** One captured exchange. */
export interface WireCapture {
    /** Absolute upstream URL that answered. */
    url: string;
    /** HTTP status of the rejecting reply. */
    status: number;
    /** Serialized request body, verbatim. */
    request: string;
    /** Upstream error body, verbatim. */
    response: string;
}
/** The configured capture directory, or undefined when capture is off. */
export declare function captureDir(): string | undefined;
/**
 * Write one exchange into the capture directory. Never throws: a diagnostic
 * must not turn a provider error into a different provider error.
 * @param capture - the exchange to record.
 */
export declare function captureWire(capture: WireCapture): Promise<void>;
