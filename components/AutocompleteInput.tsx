
import React, { useState, useEffect, useRef } from 'react';
import { searchPlaces, PlaceSuggestion } from '../services/placeService';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  iconColor: string; // 'blue' | 'pink'
  onLocationSelect?: (suggestion: PlaceSuggestion) => void;
  rightElement?: React.ReactNode; // For the GPS button
}

const AutocompleteInput: React.FC<Props> = ({ 
  value, 
  onChange, 
  placeholder, 
  iconColor,
  onLocationSelect,
  rightElement 
}) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Color classes map
  const ringColor = iconColor === 'blue' ? 'ring-blue-50 bg-blue-400' : 'ring-pink-50 bg-pink-500';
  const focusRing = iconColor === 'blue' ? 'focus:ring-blue-400' : 'focus:ring-pink-400';

  useEffect(() => {
    // Debounce logic: wait 500ms after typing stops before searching
    const timer = setTimeout(async () => {
      if (value.length >= 3 && showSuggestions) {
        setIsLoading(true);
        const results = await searchPlaces(value);
        setSuggestions(results);
        setIsLoading(false);
      } else {
        setSuggestions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [value, showSuggestions]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (place: PlaceSuggestion) => {
    // Extract a cleaner name if possible (e.g. just the first part and city)
    const fullName = place.display_name;
    onChange(fullName);
    if (onLocationSelect) {
      onLocationSelect(place);
    }
    setShowSuggestions(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(true);
  };

  return (
    <div ref={wrapperRef} className="relative group">
      {/* Icon */}
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
        <div className={`h-3 w-3 rounded-full ${ringColor} ring-4`}></div>
      </div>

      {/* Input */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => value.length >= 3 && setShowSuggestions(true)}
        className={`w-full bg-gray-50 hover:bg-gray-100 border-none rounded-2xl py-4 pl-12 pr-12 text-gray-800 font-semibold focus:ring-2 ${focusRing} transition-all placeholder-gray-400`}
      />

      {/* Loading Indicator (Small spinner inside input) */}
      {isLoading && (
        <div className="absolute inset-y-0 right-12 flex items-center pr-2 pointer-events-none">
          <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}

      {/* Right Element (GPS Button usually) */}
      {rightElement && (
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center z-10">
          {rightElement}
        </div>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
          <ul>
            {suggestions.map((place, index) => (
              <li 
                key={index + place.lat}
                onClick={() => handleSelect(place)}
                className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-none flex items-center transition-colors"
              >
                <span className="mr-3 text-lg">
                  {place.type === 'hotel' || place.type === 'guest_house' ? '🏨' : 
                   place.type === 'restaurant' || place.type === 'bar' ? '🍴' : 
                   '📍'}
                </span>
                <div className="flex-1">
                  <div className="font-bold text-gray-800 text-sm truncate">
                    {place.display_name.split(',')[0]}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                     {place.display_name.split(',').slice(1).join(',')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="bg-gray-50 px-3 py-1 text-[10px] text-gray-400 text-right">
            Powered by OpenStreetMap
          </div>
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;
