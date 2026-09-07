'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatOfficerName } from '@/lib/utils';

interface Officer {
  name: string;
  customHours?: string;
}


interface WorkedShift {
  date: string;
  dayName: string;
  timeSlot: 'morning' | 'afternoon';
  hours: string;
  customHours?: string;
  startTime: string;
  endTime: string;
}

interface ConsolidatedShift {
  date: string;
  dayName: string;
  shifts: WorkedShift[];
  totalHours: string;
  startTime: string;
  endTime: string;
}

const calculateHoursFromTimeString = (timeStr: string): string => {
  if (!timeStr) return '0';

  if (timeStr.includes(',')) {
    const segments = timeStr.split(',').map((segment) => segment.trim());
    const total = segments.reduce((hours, segment) => hours + parseFloat(calculateSingleTimeRange(segment)), 0);
    return total.toFixed(1);
  }

  return calculateSingleTimeRange(timeStr);
};

const calculateSingleTimeRange = (timeStr: string): string => {
  if (!timeStr) return '0';

  const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
  const match = timeStr.toLowerCase().match(timePattern);

  if (match) {
    const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;
    let startHour24 = parseInt(startHour, 10);
    let endHour24 = parseInt(endHour, 10);

    if (startPeriod === 'pm' && startHour24 !== 12) startHour24 += 12;
    if (startPeriod === 'am' && startHour24 === 12) startHour24 = 0;
    if (endPeriod === 'pm' && endHour24 !== 12) endHour24 += 12;
    if (endPeriod === 'am' && endHour24 === 12) endHour24 = 0;

    const startMinutes = startHour24 * 60 + parseInt(startMin, 10);
    let endMinutes = endHour24 * 60 + parseInt(endMin, 10);

    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    return ((endMinutes - startMinutes) / 60).toFixed(1);
  }

  return '0';
};

const parseTimeRange = (timeStr: string): { startTime: string; endTime: string } => {
  if (!timeStr) {
    return { startTime: '', endTime: '' };
  }

  if (timeStr.includes(',')) {
    const segments = timeStr.split(',').map((segment) => segment.trim());
    const firstSegment = parseSingleTimeRange(segments[0]);
    const lastSegment = parseSingleTimeRange(segments[segments.length - 1]);

    return {
      startTime: firstSegment.startTime,
      endTime: lastSegment.endTime,
    };
  }

  return parseSingleTimeRange(timeStr);
};

const parseSingleTimeRange = (timeStr: string): { startTime: string; endTime: string } => {
  if (!timeStr) {
    return { startTime: '', endTime: '' };
  }

  const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
  const match = timeStr.toLowerCase().match(timePattern);

  if (match) {
    const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;

    let startHour24 = parseInt(startHour, 10);
    let endHour24 = parseInt(endHour, 10);

    if (startPeriod === 'pm' && startHour24 !== 12) startHour24 += 12;
    if (startPeriod === 'am' && startHour24 === 12) startHour24 = 0;
    if (endPeriod === 'pm' && endHour24 !== 12) endHour24 += 12;
    if (endPeriod === 'am' && endHour24 === 12) endHour24 = 0;

    return {
      startTime: `${startHour24.toString().padStart(2, '0')}:${startMin}`,
      endTime: `${endHour24.toString().padStart(2, '0')}:${endMin}`,
    };
  }

  return { startTime: '', endTime: '' };
};

export default function OTSlipsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  
  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths] = useState(() => {
    const months = [];
    const today = new Date();
    
    // Next month (officers sign up in advance), current month, and past 2
    // months — newest first.
    for (let i = 1; i >= -2; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
        month: date.getMonth(),
        year: date.getFullYear()
      });
    }
    
    return months;
  });
  
  // Schedule data
  const [consolidatedShifts, setConsolidatedShifts] = useState<ConsolidatedShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<ConsolidatedShift | null>(null);
  
  // Form state
  const [email] = useState(user?.email || '');

  // Metro station details
  const METRO_LOCATION = '5501 Columbia Park Road, Cheverly MD 20785';

  // Fetch user's worked shifts for selected month
  useEffect(() => {
    const fetchWorkedShiftsForMonth = async () => {
      if (!user || !selectedMonth) return;
      
      setScheduleLoading(true);
      try {
        const currentOfficerName = user?.rank && user?.idNumber 
          ? `${user.rank} ${user.name} #${user.idNumber}`
          : user?.name;

        const monthData = availableMonths.find(m => m.key === selectedMonth);
        if (!monthData) return;

        const shifts: WorkedShift[] = [];
        
        const response = await fetch(`/api/schedule?month=${monthData.month}&year=${monthData.year}`);
        if (response.ok) {
          const data = await response.json();
          if (data.schedule) {
            data.schedule.forEach((slot: { date: string; dayName: string; morningSlot?: { time: string; officers?: Officer[] }; afternoonSlot?: { time: string; officers?: Officer[] } }) => {
              // Parse the date string properly to avoid timezone issues
              // If the date is already in ISO format, extract just the date part
              let dateStr: string;
              if (typeof slot.date === 'string' && slot.date.includes('T')) {
                // ISO format - extract just the date part
                dateStr = slot.date.split('T')[0];
              } else {
                // Try parsing as a date and format it
                const parsedDate = new Date(slot.date);
                // Create a local date to avoid timezone shifts
                const localDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
                dateStr = localDate.toISOString().split('T')[0];
              }
              
              // Check morning slot
              const morningOfficer = slot.morningSlot?.officers?.find((officer: Officer) => 
                officer.name === currentOfficerName
              );
              if (morningOfficer) {
                shifts.push({
                  date: dateStr,
                  dayName: slot.dayName,
                  timeSlot: 'morning',
                  hours: calculateHoursFromTimeString(morningOfficer.customHours || slot.morningSlot?.time || ''),
                  customHours: morningOfficer.customHours,
                  ...parseTimeRange(morningOfficer.customHours || slot.morningSlot?.time || '')
                });
              }
              
              // Check afternoon slot  
              const afternoonOfficer = slot.afternoonSlot?.officers?.find((officer: Officer) => 
                officer.name === currentOfficerName
              );
              if (afternoonOfficer) {
                shifts.push({
                  date: dateStr,
                  dayName: slot.dayName,
                  timeSlot: 'afternoon',
                  hours: calculateHoursFromTimeString(afternoonOfficer.customHours || slot.afternoonSlot?.time || ''),
                  customHours: afternoonOfficer.customHours,
                  ...parseTimeRange(afternoonOfficer.customHours || slot.afternoonSlot?.time || '')
                });
              }
            });
          }
        }
        
        // Sort by date ascending (earliest first within the month)
        shifts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Consolidate shifts by date
        const consolidated: ConsolidatedShift[] = [];
        const shiftsByDate = new Map<string, WorkedShift[]>();
        
        // Group shifts by date
        shifts.forEach(shift => {
          const existing = shiftsByDate.get(shift.date) || [];
          existing.push(shift);
          shiftsByDate.set(shift.date, existing);
        });
        
        // Create consolidated shifts
        shiftsByDate.forEach((dayShifts, date) => {
          // Sort shifts by start time
          dayShifts.sort((a, b) => {
            const aTime = parseInt(a.startTime.replace(':', ''));
            const bTime = parseInt(b.startTime.replace(':', ''));
            return aTime - bTime;
          });
          
          // Calculate total hours
          const totalHours = dayShifts.reduce((sum, shift) => sum + parseFloat(shift.hours), 0).toFixed(1);
          
          // Get earliest start time and latest end time
          const startTime = dayShifts[0].startTime;
          const endTime = dayShifts[dayShifts.length - 1].endTime;
          
          consolidated.push({
            date,
            dayName: dayShifts[0].dayName,
            shifts: dayShifts,
            totalHours,
            startTime,
            endTime
          });
        });
        
        // Sort consolidated shifts by date
        consolidated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setConsolidatedShifts(consolidated);
      } catch (error) {
        console.error('Error fetching worked shifts:', error);
        toast.error('Failed to load your worked shifts');
      } finally {
        setScheduleLoading(false);
      }
    };

    fetchWorkedShiftsForMonth();
  }, [user, selectedMonth, availableMonths]);


  const generateOTSlipPDF = async (shiftToGenerate?: ConsolidatedShift) => {
    const targetShift = shiftToGenerate || selectedShift;
    
    // Validation
    if (!targetShift) {
      toast.error('Please select a worked shift from the list');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Generating compensation form...');

    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      
      // Page setup
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      
      // Add logo
      const logoImg = new Image();
      logoImg.src = '/logo.png';
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve(); // Continue even if logo fails
      });
      
      // Try to add logo (small, top left)
      try {
        doc.addImage(logoImg, 'PNG', margin, 10, 20, 20);
      } catch {
        console.log('Logo could not be added');
      }
      
      // Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Cheverly Police Department', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPENSATION/OVERTIME REQUEST FORM', pageWidth / 2, 28, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Revised 07/06/2023', pageWidth / 2, 36, { align: 'center' });
      
      // Requestor Information Table
      let yPos = 50;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Requestor Information', margin, yPos);
      
      // Create requestor info table with better alignment
      autoTable(doc, {
        startY: yPos + 5,
        body: [
          ['First and Last Name:', user?.rank && user?.idNumber ? `${user.rank} ${user.name}` : user?.name || ''],
          ['Signature/ID number:', user?.idNumber || ''],
          ['Email:', email || '']
        ],
        theme: 'grid',
        styles: {
          fontSize: 10,
          cellPadding: 4,
          lineWidth: 0.1,
          lineColor: [0, 0, 0],
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: 'bold', halign: 'left' },
          1: { cellWidth: (pageWidth - 2 * margin - 60), halign: 'left' },
        },
        margin: { left: margin, right: margin },
      });
      
      // Get the end position of the table
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      yPos = doc.lastAutoTable?.finalY + 15 || 110;
      
      // DATE WORKED Section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DATE WORKED:', margin, yPos);
      
      // Add the actual date
      doc.setFont('helvetica', 'normal');
      const dateWorked = parseLocalDate(targetShift.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.text(dateWorked, margin + 65, yPos);
      
      // Draw line under DATE WORKED
      doc.setLineWidth(1);
      doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
      
      // Skip other sections and go directly to Metro Transit
      yPos += 15;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Metro Transit', margin, yPos);
      
      // Metro Transit table - show all shifts for the day
      const metroData = targetShift.shifts.map(shift => {
        return [
          METRO_LOCATION,
          'Off-Duty',  // Officers can only work metro shifts when off-duty
          shift.hours,
          `${formatTime12Hour(shift.startTime)} -- ${formatTime12Hour(shift.endTime)}`
        ];
      });
      
      // Add total row if multiple shifts
      if (targetShift.shifts.length > 1) {
        metroData.push([
          'TOTAL',
          '',
          targetShift.totalHours,
          ''
        ]);
      }
      
      autoTable(doc, {
        startY: yPos + 5,
        head: [['Location', 'On-Duty or Off-Duty', 'Total Hrs Worked', 'Hours Worked From -- To']],
        body: metroData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 3,
          lineWidth: 0.1,
          lineColor: [0, 0, 0],
          valign: 'middle',
          halign: 'center',
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 80, halign: 'center' },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 50, halign: 'center' },
        },
        margin: { left: margin, right: margin },
      });
      
      // Authorization section
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      yPos = doc.lastAutoTable?.finalY + 20 || 200;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Authorization:', margin, yPos);
      
      // Authorization table
      autoTable(doc, {
        startY: yPos + 5,
        head: [['Supervisor Signature:', 'Date:']],
        body: [['', '']],
        theme: 'grid',
        styles: {
          fontSize: 10,
          cellPadding: 8,
          lineWidth: 0.1,
          lineColor: [0, 0, 0],
          minCellHeight: 15,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 50 },
        },
        margin: { left: margin, right: margin },
      });
      
      // Footer warning
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('DO NOT MODIFY THIS FORM', pageWidth / 2, 270, { align: 'center' });
      
      // Save the PDF
      const fileName = `Compensation-Request-${user?.name}-${targetShift.date}.pdf`;
      doc.save(fileName);
      
      toast.dismiss(toastId);
      toast.success('Compensation request form generated successfully!');
    } catch (error) {
      console.error('Error generating compensation form:', error);
      toast.dismiss(toastId);
      toast.error('Failed to generate compensation form');
    } finally {
      setLoading(false);
    }
  };

  const formatTime12Hour = (time24: string) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${minutes} ${ampm}`;
  };

  // Helper function to parse date string and create a proper Date object
  const parseLocalDate = (dateStr: string): Date => {
    // dateStr is in format "YYYY-MM-DD"
    const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
    // Create date in local timezone (month is 0-indexed in JS)
    return new Date(year, month - 1, day);
  };

  // Month Selection View
  if (!selectedMonth) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">OT slips</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Choose a month, then a shift to download your compensation form.
          </p>
        </div>

        <section aria-labelledby="month-heading" className="space-y-3">
          <h2 id="month-heading" className="text-base font-semibold">Choose a month</h2>
          <Card className="overflow-hidden">
            <CardContent className="divide-y p-0">
              {availableMonths.map((month) => (
                <button
                  type="button"
                  key={month.key}
                  className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent sm:gap-4 sm:p-5"
                  onClick={() => setSelectedMonth(month.key)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Calendar className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-base font-medium">{month.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            Forms use the department&apos;s official template, with your scheduled hours filled in.
          </p>
        </section>
      </div>
    );
  }

  // Shifts View for Selected Month
  const selectedMonthData = availableMonths.find(m => m.key === selectedMonth);

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedMonth('');
            setSelectedShift(null);
          }}
          className="-ml-3 gap-1.5 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          All months
        </Button>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{selectedMonthData?.label}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Select a shift to download its OT slip.</p>
        </div>
      </div>

      <section aria-labelledby="shifts-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="shifts-heading" className="text-base font-semibold">Your worked shifts</h2>
          {!scheduleLoading && consolidatedShifts.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {consolidatedShifts.length} day{consolidatedShifts.length !== 1 ? 's' : ''} · {consolidatedShifts.reduce((total, day) => total + parseFloat(day.totalHours || '0'), 0).toFixed(1)} hours
            </p>
          )}
        </div>

        {scheduleLoading ? (
          <Card>
            <CardContent className="p-8 text-center" role="status">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">Loading your worked shifts…</p>
            </CardContent>
          </Card>
        ) : consolidatedShifts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center sm:p-10">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">No worked shifts found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Shifts assigned to you in {selectedMonthData?.label} will appear here.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedMonth('');
                  setConsolidatedShifts([]);
                }}
                className="mt-5"
              >
                Choose another month
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {consolidatedShifts.map((dayShift, index) => (
              <button
                type="button"
                key={`${dayShift.date}-${index}`}
                disabled={loading}
                className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/50 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:p-5"
                onClick={() => {
                  setSelectedShift(dayShift);
                  generateOTSlipPDF(dayShift);
                }}
              >
                <span className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block text-base font-semibold">
                      {parseLocalDate(dayShift.date).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric'
                      })}
                    </span>
                    <span className="block text-sm leading-relaxed text-muted-foreground">
                      {dayShift.shifts.map((shift, idx) => (
                        <span key={idx} className="block">
                          {shift.timeSlot === 'morning' ? 'Morning' : 'Afternoon'}: {formatTime12Hour(shift.startTime)} – {formatTime12Hour(shift.endTime)} ({shift.hours} hrs)
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 sm:flex-col sm:items-end sm:gap-2 sm:border-0 sm:pt-0">
                    <span className="text-sm font-medium tabular-nums">{dayShift.totalHours} hrs total</span>
                    <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary sm:min-h-0">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {loading && selectedShift?.date === dayShift.date ? 'Generating…' : 'Download OT slip'}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-4 border-t pt-5">
        <div>
          <h2 className="text-sm font-medium">Officer details on your form</h2>
          <dl className="mt-3 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="mt-1 break-words">
                {user?.rank && user?.idNumber
                  ? formatOfficerName(user.name, user.rank, user.idNumber)
                  : user?.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Badge number</dt>
              <dd className="mt-1 break-words">{user?.idNumber || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Rank</dt>
              <dd className="mt-1 break-words">{user?.rank || 'N/A'}</dd>
            </div>
          </dl>
        </div>
        <p className="text-sm text-muted-foreground">Print and sign your form, then submit it to your supervisor.</p>
        <details className="text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-md py-3 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">About your OT form</summary>
          <p className="mt-1 leading-relaxed">
            Hours and times come from your scheduled shifts. Metro shifts are marked as Off-Duty work,
            with the station address filled in. The PDF follows the department&apos;s official
            Compensation/Overtime Request Form (Rev. 07/06/2023).
          </p>
        </details>
      </div>
    </div>
  );
}
