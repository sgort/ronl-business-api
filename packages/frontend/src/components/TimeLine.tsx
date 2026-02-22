import React, { useState, useEffect, useRef } from 'react';
import type { BRPEvent } from '../types/brp.types';

interface TimelineProps {
  events: BRPEvent[];
  minDate: Date;
  maxDate: Date;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isLoading?: boolean; // Add this prop
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  minDate,
  maxDate,
  selectedDate,
  onDateChange,
  isLoading = false, // Default to false
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate position as percentage between min and max date
  const dateToPercentage = (date: Date): number => {
    const totalRange = maxDate.getTime() - minDate.getTime();
    const currentRange = date.getTime() - minDate.getTime();
    return (currentRange / totalRange) * 100;
  };

  // Calculate date from percentage
  const percentageToDate = (percentage: number): Date => {
    const totalRange = maxDate.getTime() - minDate.getTime();
    const currentRange = (percentage / 100) * totalRange;
    return new Date(minDate.getTime() + currentRange);
  };

  // Handle drag
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;
    const newDate = percentageToDate(percentage);

    onDateChange(newDate);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // Handle click on timeline
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const newDate = percentageToDate(percentage);

    onDateChange(newDate);
  };

  // Generate year markers
  const generateYearMarkers = () => {
    const startYear = minDate.getFullYear();
    const endYear = maxDate.getFullYear();
    const markers: { year: number; position: number }[] = [];

    for (let year = startYear; year <= endYear; year += 5) {
      const yearDate = new Date(year, 0, 1);
      const position = dateToPercentage(yearDate);
      markers.push({ year, position });
    }

    return markers;
  };

  const currentPosition = dateToPercentage(selectedDate);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 relative">
      {/* Loading Overlay - This is where the loading state goes! */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg z-20">
          <div className="text-gray-600">Gegevens laden...</div>
        </div>
      )}

      {/* Date Display */}
      <div className="mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-800">
            {selectedDate.toLocaleDateString('nl-NL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>

      {/* Timeline Track */}
      <div
        ref={timelineRef}
        className="relative h-20 bg-gray-100 rounded-lg cursor-pointer"
        onClick={handleTimelineClick}
      >
        {/* Timeline Line */}
        <div className="absolute top-1/2 left-0 right-0 h-2 bg-gray-300 rounded-full transform -translate-y-1/2" />

        {/* Year Markers */}
        {generateYearMarkers().map(({ year, position }) => (
          <div
            key={year}
            className="absolute top-0 transform -translate-x-1/2"
            style={{ left: `${position}%` }}
          >
            <div className="text-xs text-gray-600 mb-1">{year}</div>
            <div className="w-px h-8 bg-gray-400" />
          </div>
        ))}

        {/* Event Markers */}
        {events.map((event) => {
          const position = dateToPercentage(event.date);
          return (
            <button
              key={event.id}
              className="absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${position}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onDateChange(event.date);
              }}
              title={event.description}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-md transition-all group-hover:scale-125"
                style={{ backgroundColor: 'var(--color-primary)' }}
              />
              <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs bg-gray-800 text-white px-2 py-1 rounded">
                {event.label}
              </div>
            </button>
          );
        })}

        {/* Current Position Marker */}
        <div
          className="absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: `${currentPosition}%` }}
        >
          <div
            className="w-6 h-6 rounded-full border-4 border-white shadow-lg cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onMouseDown={() => setIsDragging(true)}
          />
        </div>
      </div>

      {/* Jump to Event Buttons */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => onDateChange(new Date())}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Vandaag
        </button>
        {events.map((event) => (
          <button
            key={event.id}
            onClick={() => onDateChange(event.date)}
            className="px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {event.label}
          </button>
        ))}
      </div>
    </div>
  );
};
