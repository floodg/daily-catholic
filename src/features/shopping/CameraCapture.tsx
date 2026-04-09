import { forwardRef } from 'react';

type Props = {
  onFilesSelected: (files: FileList | null) => void;
};

const CameraCapture = forwardRef<HTMLInputElement, Props>(function CameraCapture(
  { onFilesSelected },
  ref
) {
  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      multiple
      capture="environment"
      onChange={(e) => onFilesSelected(e.target.files)}
      style={{ display: 'none' }}
    />
  );
});

export default CameraCapture;
