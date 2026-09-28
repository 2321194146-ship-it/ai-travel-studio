"use client";

export default function CustomToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) {
  return (
    <div
      className={`flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded p-4 ${disabled ? "opacity-35" : ""}`}
    >
      <div className="flex flex-col">
        <span className="text-xs font-bold text-zinc-200">{label}</span>
        {description && (
          <span className="text-[10px] text-zinc-500 mt-0.5">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none disabled:cursor-not-allowed ${
          checked ? "bg-teal-500" : "bg-zinc-800"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
