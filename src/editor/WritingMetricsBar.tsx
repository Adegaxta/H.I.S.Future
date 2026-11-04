interface Props {
  words: number;
  chars: number;
  readingMin: number;
  selectedWords?: number;
  selectedChars?: number;
}

export function WritingMetricsBar({
  words,
  chars,
  readingMin,
  selectedWords = 0,
  selectedChars = 0,
}: Props) {
  if (words === 0 && chars === 0) return null;

  return (
    <div className="his-editor-metrics" role="status" aria-live="polite">
      {selectedWords > 0 ? (
        <span>
          <strong>{selectedWords}</strong> {selectedWords === 1 ? "palabra seleccionada" : "palabras seleccionadas"} ({selectedChars} car.)
        </span>
      ) : (
        <>
          <span>{words} {words === 1 ? "palabra" : "palabras"}</span>
          <span className="his-editor-metrics__dot">·</span>
          <span>{chars} car.</span>
          <span className="his-editor-metrics__dot">·</span>
          <span>~{readingMin} min</span>
        </>
      )}
    </div>
  );
}
