'use client';

export default function ModelPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Model:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border px-2 py-1 bg-white"
      >
        <option value="light">Light</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </div>
  );
}