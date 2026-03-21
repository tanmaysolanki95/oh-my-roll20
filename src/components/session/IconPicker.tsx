"use client";

import { useState } from "react";
import Image from "next/image";
import { ICONS, ICON_CATEGORIES, getIconsByCategory } from "@/lib/icons";
import type { IconCategory } from "@/lib/icons";

interface IconPickerProps {
  value: string | null;
  onChange: (path: string | null) => void;
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<IconCategory>("humans");

  const currentIcon = value ? ICONS.find((i) => i.path === value) : null;
  const categoryIcons = getIconsByCategory(activeCategory);

  function select(path: string | null) {
    onChange(path);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-400">Icon</label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-2 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-left transition-colors"
        title="Choose a character icon"
      >
        {currentIcon ? (
          <>
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-gray-600">
              <Image src={currentIcon.path} alt={currentIcon.name} width={28} height={28} className="object-cover w-full h-full" />
            </div>
            <span className="text-white truncate">{currentIcon.name}</span>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-full bg-gray-600 shrink-0 flex items-center justify-center text-gray-400 text-xs">?</div>
            <span className="text-gray-400">No icon</span>
          </>
        )}
        <span className="ml-auto text-gray-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {/* Picker panel */}
      {open && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
          {/* Category tabs */}
          <div className="flex border-b border-gray-700">
            {ICON_CATEGORIES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === id
                    ? "bg-indigo-700 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Icon grid */}
          <div className="p-2 max-h-52 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1.5">
              {/* None option */}
              <button
                type="button"
                onClick={() => select(null)}
                title="No icon"
                className={`aspect-square rounded-lg flex items-center justify-center text-gray-500 text-lg border transition-colors ${
                  value === null
                    ? "border-indigo-500 bg-indigo-950/60"
                    : "border-gray-700 hover:border-gray-500 bg-gray-800/60"
                }`}
              >
                ✕
              </button>

              {categoryIcons.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => select(icon.path)}
                  title={icon.name}
                  className={`aspect-square rounded-lg overflow-hidden border transition-colors ${
                    value === icon.path
                      ? "border-indigo-500 ring-1 ring-indigo-500"
                      : "border-gray-700 hover:border-gray-400"
                  }`}
                >
                  <Image
                    src={icon.path}
                    alt={icon.name}
                    width={56}
                    height={56}
                    className="object-cover w-full h-full"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
