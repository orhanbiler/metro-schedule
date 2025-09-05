'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Calendar, Clock, AlertCircle, ChevronLeft } from 'lucide-react';
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

export default function OTSlipsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  
  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths] = useState(() => {
    const months = [];
    const today = new Date();
    
    // Current month and past 2 months (so 3 total including current)
    for (let i = 0; i < 3; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
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
  const [workedShifts, setWorkedShifts] = useState<WorkedShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<WorkedShift | null>(null);
  
  // Form state
  const [onDutyOffDuty, setOnDutyOffDuty] = useState('On-Duty');
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
          ? formatOfficerName(user.name, user.rank, user.idNumber)
          : user?.name;

        const monthData = availableMonths.find(m => m.key === selectedMonth);
        if (!monthData) return;

        const shifts: WorkedShift[] = [];
        
        const response = await fetch(`/api/schedule?month=${monthData.month}&year=${monthData.year}`);
        if (response.ok) {
          const data = await response.json();
          if (data.schedule) {
            data.schedule.forEach((slot: { date: string; dayName: string; morningSlot?: { time: string; officers?: Officer[] }; afternoonSlot?: { time: string; officers?: Officer[] } }) => {
              const slotDate = new Date(slot.date);
              
              // Check morning slot
              const morningOfficer = slot.morningSlot?.officers?.find((officer: Officer) => 
                officer.name === currentOfficerName
              );
              if (morningOfficer) {
                shifts.push({
                  date: slotDate.toISOString().split('T')[0],
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
                  date: slotDate.toISOString().split('T')[0],
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
        setWorkedShifts(shifts);
      } catch (error) {
        console.error('Error fetching worked shifts:', error);
        toast.error('Failed to load your worked shifts');
      } finally {
        setScheduleLoading(false);
      }
    };

    fetchWorkedShiftsForMonth();
  }, [user, selectedMonth, availableMonths]);

  // Helper functions
  const calculateHoursFromTimeString = (timeStr: string): string => {
    if (!timeStr) return '0';
    
    // Handle custom time format like "6:00am-2:00pm" or "06:00-14:00" or "0600-1400"
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
    const match = timeStr.toLowerCase().match(timePattern);
    
    if (match) {
      const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;
      
      // Convert to 24-hour format
      let startHour24 = parseInt(startHour);
      let endHour24 = parseInt(endHour);
      
      if (startPeriod === 'pm' && startHour24 !== 12) startHour24 += 12;
      if (startPeriod === 'am' && startHour24 === 12) startHour24 = 0;
      if (endPeriod === 'pm' && endHour24 !== 12) endHour24 += 12;
      if (endPeriod === 'am' && endHour24 === 12) endHour24 = 0;
      
      const startMinutes = startHour24 * 60 + parseInt(startMin);
      let endMinutes = endHour24 * 60 + parseInt(endMin);
      
      // Handle overnight shifts
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60;
      }
      
      return ((endMinutes - startMinutes) / 60).toFixed(1);
    }
    
    return '0';
  };

  const parseTimeRange = (timeStr: string): { startTime: string; endTime: string } => {
    if (!timeStr) return { startTime: '', endTime: '' };
    
    // Handle various time formats
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
    const match = timeStr.toLowerCase().match(timePattern);
    
    if (match) {
      const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;
      
      // Convert to 24-hour format
      let startHour24 = parseInt(startHour);
      let endHour24 = parseInt(endHour);
      
      if (startPeriod === 'pm' && startHour24 !== 12) startHour24 += 12;
      if (startPeriod === 'am' && startHour24 === 12) startHour24 = 0;
      if (endPeriod === 'pm' && endHour24 !== 12) endHour24 += 12;
      if (endPeriod === 'am' && endHour24 === 12) endHour24 = 0;
      
      return {
        startTime: `${startHour24.toString().padStart(2, '0')}:${startMin}`,
        endTime: `${endHour24.toString().padStart(2, '0')}:${endMin}`
      };
    }
    
    return { startTime: '', endTime: '' };
  };


  const generateOTSlipPDF = async (shiftToGenerate?: WorkedShift) => {
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
          ['Rank:', user?.rank || ''],
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
      const dateWorked = new Date(targetShift.date).toLocaleDateString('en-US', {
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
      
      // Metro Transit table
      const metroData = [
        [
          METRO_LOCATION,
          onDutyOffDuty,
          targetShift.hours,
          `${formatTime12Hour(targetShift.startTime)} -- ${formatTime12Hour(targetShift.endTime)}`
        ]
      ];
      
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

  // Month Selection View
  if (!selectedMonth) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Compensation Request Forms</CardTitle>
                <CardDescription>
                  Select a month to view your worked shifts and generate OT slips
                </CardDescription>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Select Month</h3>
              <p className="text-sm text-muted-foreground">
                Choose a month to view your worked shifts. You can generate compensation forms for any shifts you worked.
              </p>
              
              <div className="grid gap-4">
                {availableMonths.map((month) => (
                  <Card
                    key={month.key}
                    className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
                    onClick={() => setSelectedMonth(month.key)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-lg font-medium">{month.label}</h4>
                          <p className="text-sm text-muted-foreground">
                            View worked shifts and generate OT slips
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-primary">
                          <Calendar className="h-5 w-5" />
                          <span className="text-sm font-medium">Select</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Select a month to view your scheduled shifts</li>
                <li>• Only months with potential overtime shifts are shown</li>
                <li>• Generate official compensation forms for any worked shifts</li>
                <li>• Forms match the department&apos;s official template</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Shifts View for Selected Month
  const selectedMonthData = availableMonths.find(m => m.key === selectedMonth);
  
  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedMonth('');
                  setWorkedShifts([]);
                  setSelectedShift(null);
                }}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Months
              </Button>
              <div>
                <CardTitle className="text-2xl">
                  {selectedMonthData?.label} - Worked Shifts
                </CardTitle>
                <CardDescription>
                  Generate compensation request forms for your worked shifts
                </CardDescription>
              </div>
            </div>
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Worked Shifts for Selected Month */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Your Worked Shifts
              </h3>
              {!scheduleLoading && workedShifts.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {workedShifts.length} shift{workedShifts.length !== 1 ? 's' : ''} • {workedShifts.reduce((total, shift) => total + parseFloat(shift.hours || '0'), 0).toFixed(1)} total hours
                </div>
              )}
            </div>
            
            {scheduleLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading your worked shifts for {selectedMonthData?.label}...</p>
              </div>
            ) : workedShifts.length === 0 ? (
              <div className="text-center py-8 border rounded-lg bg-muted/20">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No worked shifts found for {selectedMonthData?.label}.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Make sure you were assigned to shifts in this month&apos;s schedule.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedMonth('');
                    setWorkedShifts([]);
                  }}
                  className="mt-4"
                >
                  Try Another Month
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {workedShifts.map((shift, index) => (
                  <div
                    key={`${shift.date}-${shift.timeSlot}-${index}`}
                    className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (!loading) {
                        setSelectedShift(shift);
                        generateOTSlipPDF(shift);
                      }
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {new Date(shift.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {shift.timeSlot === 'morning' ? 'Morning Shift' : 'Afternoon Shift'}
                        </div>
                        {shift.customHours && (
                          <div className="text-sm text-blue-600">
                            Custom Hours: {shift.customHours}
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          {formatTime12Hour(shift.startTime)} - {formatTime12Hour(shift.endTime)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-medium text-lg">{shift.hours} hours</div>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShift(shift);
                            generateOTSlipPDF(shift);
                          }}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          disabled={loading}
                        >
                          <Download className="h-4 w-4" />
                          {loading && selectedShift?.date === shift.date && selectedShift?.timeSlot === shift.timeSlot 
                            ? 'Generating...' 
                            : 'Generate OT Slip'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Duty Status Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Form Settings</h3>
              <div className="flex items-center gap-2">
                <Label htmlFor="on-duty-off-duty" className="text-sm">Duty Status:</Label>
                <Select value={onDutyOffDuty} onValueChange={setOnDutyOffDuty}>
                  <SelectTrigger id="on-duty-off-duty" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="On-Duty">On-Duty</SelectItem>
                    <SelectItem value="Off-Duty">Off-Duty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Officer Information Display */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Officer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div>
                <span className="font-medium">Name: </span>
                {user?.rank && user?.idNumber 
                  ? formatOfficerName(user.name, user.rank, user.idNumber)
                  : user?.name}
              </div>
              <div>
                <span className="font-medium">Badge #: </span>
                {user?.idNumber || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Rank: </span>
                {user?.rank || 'N/A'}
              </div>
            </div>
          </div>
          
        </CardContent>
      </Card>
      
      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Select a month to view your worked shifts from that period</p>
          <p>• Hours and times are automatically pulled from your actual scheduled shifts</p>
          <p>• Click &quot;Generate OT Slip&quot; for any shift to create a compensation form</p>
          <p>• Select duty status (On-Duty/Off-Duty) before generating if needed</p>
          <p>• The system generates official Compensation/Overtime Request Forms</p>
          <p>• Generated PDF matches the department&apos;s official form template (Rev. 07/06/2023)</p>
          <p>• Print and sign the form, then submit to your supervisor</p>
          <p>• Location is automatically filled with Metro station address</p>
        </CardContent>
      </Card>
    </div>
  );
}