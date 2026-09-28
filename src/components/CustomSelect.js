"use client";

import { useState, useEffect, useRef } from "react";
import { FaChevronDown } from "react-icons/fa";

export default function CustomSelect({
  value,
  onChange,
  options,
  label,
  openUpwards = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const currentLabel = (() => {
    const found = options.find((o) =>
      typeof o === "object" && o !== null && "value" in o
        ? o.value === value
        : o === value,
    );
    return found && typeof found === "object" ? found.label : value;
  })();

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5 w-full">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between text-xs text-zinc-200 bg-zinc-950/80 border border-zinc-800 rounded px-3.5 py-2.5 outline-none hover:border-teal-500/50 transition-colors w-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <span>{currentLabel}</span>
        <FaChevronDown
          className={`text-[10px] text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && !disabled && (
        <div
          className={`absolute ${openUpwards ? "bottom-10" : "top-10"} left-0 right-0 z-[150] bg-zinc-950/95 border border-zinc-800 rounded shadow-xl max-h-56 overflow-y-auto overscroll-contain`}
        >
          {options.map((opt) => {
            const isObj =
              typeof opt === "object" && opt !== null && "value" in opt;
            const val = isObj ? opt.value : opt;
            const label = isObj ? opt.label : opt;
            return (
              <button
                key={String(val)}
                type="button"
                onClick={() => {
                  onChange(val);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-teal-500 hover:text-zinc-950 ${
                  value === val
                    ? "bg-teal-500/20 text-teal-400 font-bold"
                    : "text-zinc-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
