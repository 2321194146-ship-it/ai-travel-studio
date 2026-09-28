"use client";

import { useState, useEffect, useRef } from "react";
import { FaExchangeAlt } from "react-icons/fa";

export default function CompareSlider({ original, result }) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMove = (clientX) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPos(percentage);
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      if (e.touches && e.touches[0]) {
        handleMove(e.touches[0].clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchend", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden rounded bg-zinc-950 flex items-center justify-center cursor-ew-resize"
    >
      {/* Before Image (Left background) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={original}
        alt="原图"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        draggable={false}
      />

      {/* After Image (Right clipped overlay) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none select-none"
        draggable={false}
        style={{
          clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result}
          alt="AI生成"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          draggable={false}
        />
      </div>

      {/* Vertical Slider Bar handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-30 shadow-2xl flex items-center justify-center"
        style={{ left: `${sliderPos}%` }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onTouchStart={(e) => {
          setIsDragging(true);
        }}
      >
        <div className="h-8 w-8 rounded-full flex-shrink-0 bg-white text-zinc-900 shadow-xl border border-zinc-200 flex items-center justify-center text-xs font-bold pointer-events-none hover:scale-105 active:scale-95 transition-all">
          <FaExchangeAlt className="rotate-0 text-[10px]" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm border border-zinc-800 text-[10px] text-zinc-400 font-bold px-2 py-1 rounded select-none pointer-events-none">
        原图
      </div>
      <div className="absolute top-3 right-3 bg-teal-950/60 backdrop-blur-sm border border-teal-800 text-[10px] text-teal-300 font-bold px-2 py-1 rounded select-none pointer-events-none">
        AI生成
      </div>
    </div>
  );
}
