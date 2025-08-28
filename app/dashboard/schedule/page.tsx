'use client';

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { HoursDialog } from '@/components/schedule/hours-dialog';
import { AdminAssignDialog } from '@/components/schedule/admin-assign-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, Trash2, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface Officer {
  name: string;
  customHours?: string;
}

interface TimeSlot {
  id: string;
  date: Date;
  dayName: string;
  morningSlot: {
    time: '0600-1200';
    available: boolean;
    officers: Officer[];
    maxOfficers: 2;
  };
  afternoonSlot: {
    time: '1400-2000';
    available: boolean;
    officers: Officer[];
    maxOfficers: 2;
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  rank?: string;
  idNumber?: string;
}

export default function SchedulePage() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [schedule, setSchedule] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);


  const getCurrentOfficerFormatted = () => {
    if (user?.rank && user?.idNumber) {
      return `${user.rank} ${user.name} #${user.idNumber}`;
    }
    return user?.name || 'Current Officer';
  };

  const hasUserSignedUpForSlot = (date: Date, slotType: 'morning' | 'afternoon') => {
    const currentOfficerName = getCurrentOfficerFormatted();
    const targetSlot = schedule.find(slot => 
      slot.date.toDateString() === date.toDateString()
    );
    
    if (!targetSlot) return false;
    
    if (slotType === 'morning') {
      return targetSlot.morningSlot.officers.some(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
    } else {
      return targetSlot.afternoonSlot.officers.some(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
    }
  };
  
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    
    // Load initial schedule
    loadSchedule();
    
    // Set up real-time listener
    const unsubscribe = setupRealtimeListener();
    
    // Clean up listener on unmount or month/year change
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAllUsers();
    }
  }, [user]);

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const users = await response.json();
        // Filter to only officers (not admins) for schedule assignment
        setAllUsers(users.filter((u: User) => u.role === 'user'));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };


  const generateSchedule = () => {
    const slots: TimeSlot[] = [];
    const year = selectedYear;
    const month = selectedMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayName = dayNames[date.getDay()];
      
      // Skip weekends for this example
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        slots.push({
          id: `${year}-${month}-${day}`,
          date: date,
          dayName: dayName,
          morningSlot: {
            time: '0600-1200',
            available: true,
            officers: [],
            maxOfficers: 2,
          },
          afternoonSlot: {
            time: '1400-2000',
            available: true,
            officers: [],
            maxOfficers: 2,
          }
        });
      }
    }
    
    return slots;
  };

  const loadSchedule = async () => {
    try {
      const response = await fetch(`/api/schedule?month=${selectedMonth}&year=${selectedYear}`);
      if (response.ok) {
        const data = await response.json();
        if (data.schedule && data.schedule.length > 0) {
          // Convert date strings back to Date objects and migrate data structure
          const scheduleWithDates = data.schedule.map((slot: TimeSlot) => ({
            ...migrateSlotData(slot),
            date: new Date(slot.date)
          }));
          setSchedule(scheduleWithDates);
        } else {
          // No saved schedule, generate new one
          const newSchedule = generateSchedule();
          setSchedule(newSchedule);
        }
      } else {
        // Fallback to generated schedule
        const newSchedule = generateSchedule();
        setSchedule(newSchedule);
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      // Fallback to generated schedule
      const newSchedule = generateSchedule();
      setSchedule(newSchedule);
    }
  };

  const migrateSlotData = (slot: TimeSlot & { 
    morningSlot?: { officer?: string; customHours?: string }; 
    afternoonSlot?: { officer?: string; customHours?: string } 
  }) => {
    // Migrate old data structure to new structure
    const migratedSlot = { ...slot };
    
    // Handle morning slot migration
    if (slot.morningSlot) {
      if (slot.morningSlot.officer && !slot.morningSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.morningSlot.officer ? [{
          name: slot.morningSlot.officer,
          customHours: slot.morningSlot.customHours
        }] : [];
        migratedSlot.morningSlot = {
          time: slot.morningSlot.time,
          available: officers.length < 2,
          officers: officers,
          maxOfficers: 2
        };
      } else if (!slot.morningSlot.officers) {
        // No officers array, create empty one
        migratedSlot.morningSlot = {
          ...slot.morningSlot,
          officers: [],
          maxOfficers: 2,
          available: true
        };
      } else {
        // Already has officers array, fix availability if inconsistent
        migratedSlot.morningSlot = {
          ...slot.morningSlot,
          available: slot.morningSlot.officers.length < 2,
          maxOfficers: slot.morningSlot.maxOfficers || 2
        };
      }
    }
    
    // Handle afternoon slot migration
    if (slot.afternoonSlot) {
      if (slot.afternoonSlot.officer && !slot.afternoonSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.afternoonSlot.officer ? [{
          name: slot.afternoonSlot.officer,
          customHours: slot.afternoonSlot.customHours
        }] : [];
        migratedSlot.afternoonSlot = {
          time: slot.afternoonSlot.time,
          available: officers.length < 2,
          officers: officers,
          maxOfficers: 2
        };
      } else if (!slot.afternoonSlot.officers) {
        // No officers array, create empty one
        migratedSlot.afternoonSlot = {
          ...slot.afternoonSlot,
          officers: [],
          maxOfficers: 2,
          available: true
        };
      } else {
        // Already has officers array, fix availability if inconsistent
        migratedSlot.afternoonSlot = {
          ...slot.afternoonSlot,
          available: slot.afternoonSlot.officers.length < 2,
          maxOfficers: slot.afternoonSlot.maxOfficers || 2
        };
      }
    }
    
    return migratedSlot;
  };

  const setupRealtimeListener = () => {
    const scheduleId = `${selectedYear}-${selectedMonth}`;
    const scheduleRef = doc(db, 'schedules', scheduleId);
    
    const unsubscribe = onSnapshot(scheduleRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.schedule && data.schedule.length > 0) {
          // Convert date strings back to Date objects and migrate data structure
          const scheduleWithDates = data.schedule.map((slot: TimeSlot) => ({
            ...migrateSlotData(slot),
            date: new Date(slot.date)
          }));
          
          setSchedule(scheduleWithDates);
        }
      }
    }, (error) => {
      console.error('Error listening to schedule changes:', error);
    });

    return unsubscribe;
  };

  const saveSchedule = async (updatedSchedule: TimeSlot[]) => {
    try {
      // Saving schedule to API
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          schedule: updatedSchedule
        })
      });
      
      if (response.ok) {
        // Schedule saved successfully
      } else {
        const errorData = await response.text();
        // API returned error response
        
        // Show user-friendly error message
        if (response.status === 403) {
          toast.error('Permission denied. Please check with your administrator.');
        } else if (response.status === 401) {
          toast.error('Authentication required. Please log in again.');
        } else {
          toast.error('Failed to save schedule. Please try again.');
        }
        
        throw new Error(`HTTP ${response.status}: ${errorData}`);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      throw error;
    }
  };


  const handleSignUp = async (slotId: string, slotType: 'morning' | 'afternoon', customHours: string) => {
    if (!user?.name) {
      toast.error('User authentication failed. Please log in again.');
      return;
    }

    if (!customHours.trim()) {
      toast.error('Please specify custom hours for your shift.');
      return;
    }

    setLoading(true);
    
    try {
      const updatedSchedule = schedule.map(slot => {
        if (slot.id === slotId) {
          const currentOfficer = getCurrentOfficerFormatted();
          const newOfficer: Officer = {
            name: currentOfficer,
            customHours: customHours !== (slotType === 'morning' ? slot.morningSlot.time : slot.afternoonSlot.time) ? customHours : undefined
          };

          if (slotType === 'morning') {
            // Check if officer is already signed up
            const alreadySignedUp = slot.morningSlot.officers.some(officer => officer.name === currentOfficer);
            if (alreadySignedUp) {
              toast.error('You are already signed up for this shift');
              return slot;
            }
            
            const updatedOfficers = [...slot.morningSlot.officers, newOfficer];
            return {
              ...slot,
              morningSlot: {
                ...slot.morningSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.morningSlot.maxOfficers
              }
            };
          } else {
            // Check if officer is already signed up
            const alreadySignedUp = slot.afternoonSlot.officers.some(officer => officer.name === currentOfficer);
            if (alreadySignedUp) {
              toast.error('You are already signed up for this shift');
              return slot;
            }
            
            const updatedOfficers = [...slot.afternoonSlot.officers, newOfficer];
            return {
              ...slot,
              afternoonSlot: {
                ...slot.afternoonSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.afternoonSlot.maxOfficers
              }
            };
          }
        }
        return slot;
      });

      // Don't update local state - let real-time listener handle it
      await saveSchedule(updatedSchedule);
      toast.success(`Successfully signed up for ${customHours} shift`);
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('Failed to sign up for shift. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOfficer = async (slotId: string, slotType: 'morning' | 'afternoon', officerToRemove: string) => {
    if (!user?.role || user.role !== 'admin') {
      toast.error('Only administrators can remove officers from shifts.');
      return;
    }

    if (!officerToRemove?.trim()) {
      toast.error('Invalid officer information. Cannot remove from shift.');
      return;
    }

    const slot = schedule.find(s => s.id === slotId);
    if (!slot) {
      toast.error('Shift not found. Please refresh the page and try again.');
      return;
    }

    const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    if (!targetSlot.officers.some(officer => officer.name === officerToRemove)) {
      toast.error('Officer not found in this shift.');
      return;
    }

    setLoading(true);
    
    try {
      const updatedSchedule = schedule.map(slot => {
        if (slot.id === slotId) {
          if (slotType === 'morning') {
            const updatedOfficers = slot.morningSlot.officers.filter(officer => officer.name !== officerToRemove);
            return {
              ...slot,
              morningSlot: {
                ...slot.morningSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.morningSlot.maxOfficers
              }
            };
          } else {
            const updatedOfficers = slot.afternoonSlot.officers.filter(officer => officer.name !== officerToRemove);
            return {
              ...slot,
              afternoonSlot: {
                ...slot.afternoonSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.afternoonSlot.maxOfficers
              }
            };
          }
        }
        return slot;
      });

      await saveSchedule(updatedSchedule);
      toast.success(`Successfully removed ${officerToRemove} from shift`);
    } catch (error) {
      console.error('Remove officer error:', error);
      toast.error('Failed to remove officer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAssign = async (slotId: string, slotType: 'morning' | 'afternoon', officerName: string, customHours?: string) => {
    if (!user?.role || user.role !== 'admin') {
      toast.error('Only administrators can assign officers to shifts.');
      return;
    }

    if (!officerName?.trim()) {
      toast.error('Please select an officer to assign to the shift.');
      return;
    }

    const slot = schedule.find(s => s.id === slotId);
    if (!slot) {
      toast.error('Shift not found. Please refresh the page and try again.');
      return;
    }

    const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    if (targetSlot.officers.length >= targetSlot.maxOfficers) {
      toast.error('This shift is already full. Maximum 2 officers allowed per shift.');
      return;
    }

    setLoading(true);
    
    try {
      const updatedSchedule = schedule.map(slot => {
        if (slot.id === slotId) {
          const newOfficer: Officer = {
            name: officerName,
            customHours: customHours || undefined
          };

          if (slotType === 'morning') {
            // Check if officer is already assigned
            const alreadyAssigned = slot.morningSlot.officers.some(officer => officer.name === officerName);
            if (alreadyAssigned) {
              toast.error('Officer is already assigned to this shift');
              return slot;
            }
            
            const updatedOfficers = [...slot.morningSlot.officers, newOfficer];
            return {
              ...slot,
              morningSlot: {
                ...slot.morningSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.morningSlot.maxOfficers
              }
            };
          } else {
            // Check if officer is already assigned
            const alreadyAssigned = slot.afternoonSlot.officers.some(officer => officer.name === officerName);
            if (alreadyAssigned) {
              toast.error('Officer is already assigned to this shift');
              return slot;
            }
            
            const updatedOfficers = [...slot.afternoonSlot.officers, newOfficer];
            return {
              ...slot,
              afternoonSlot: {
                ...slot.afternoonSlot,
                officers: updatedOfficers,
                available: updatedOfficers.length < slot.afternoonSlot.maxOfficers
              }
            };
          }
        }
        return slot;
      });

      await saveSchedule(updatedSchedule);
      toast.success(`Successfully assigned ${officerName} to shift`);
    } catch (error) {
      console.error('Admin assign error:', error);
      toast.error('Failed to assign officer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!schedule || schedule.length === 0) {
      toast.error('No schedule data available to export. Please wait for the schedule to load.');
      return;
    }

    const toastId = toast.loading('Generating PDF...');

    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      
      const doc = new jsPDF();
      
      // Add logo
      const logoImg = new Image();
      logoImg.src = '/logo.png';
      await new Promise((resolve) => {
        logoImg.onload = resolve;
      });
      
      // Add logo to PDF (positioned at top left)
      const logoWidth = 30;
      const logoHeight = 30;
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.addImage(logoImg, 'PNG', 20, 15, logoWidth, logoHeight);
          
          // Header (positioned to the right of logo)
          doc.setFontSize(18);
          doc.setFont('helvetica', 'bold');
          doc.text('CHEVERLY POLICE DEPARTMENT', 60, 25);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'normal');
          doc.text('Metro Overtime Schedule', 60, 35);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`${monthNames[selectedMonth]} ${selectedYear}`, 60, 45);
          
          // Prepare table data
          const tableData: Array<[string, string, string]> = [];
          
          schedule.forEach(slot => {
            // Morning slot
            if (slot.morningSlot.officers.length > 0) {
              slot.morningSlot.officers.forEach((officer, index) => {
                const displayTime = officer.customHours || 
                  `${slot.morningSlot.time.slice(0, 4)}-${slot.morningSlot.time.slice(4)}`;
                tableData.push([
                  index === 0 ? `${slot.dayName} ${formatDate(slot.date)}` : '',
                  displayTime,
                  officer.name
                ]);
              });
              
              // Show remaining slots if any
              const remainingSlots = slot.morningSlot.maxOfficers - slot.morningSlot.officers.length;
              for (let i = 0; i < remainingSlots; i++) {
                tableData.push([
                  slot.morningSlot.officers.length === 0 && i === 0 ? `${slot.dayName} ${formatDate(slot.date)}` : '',
                  `${slot.morningSlot.time.slice(0, 4)}-${slot.morningSlot.time.slice(4)}`,
                  'Available'
                ]);
              }
            } else {
              // No officers, show available slots
              for (let i = 0; i < slot.morningSlot.maxOfficers; i++) {
                tableData.push([
                  i === 0 ? `${slot.dayName} ${formatDate(slot.date)}` : '',
                  `${slot.morningSlot.time.slice(0, 4)}-${slot.morningSlot.time.slice(4)}`,
                  'Available'
                ]);
              }
            }
            
            // Afternoon slot
            if (slot.afternoonSlot.officers.length > 0) {
              slot.afternoonSlot.officers.forEach((officer) => {
                const displayTime = officer.customHours || 
                  `${slot.afternoonSlot.time.slice(0, 4)}-${slot.afternoonSlot.time.slice(4)}`;
                tableData.push([
                  '',
                  `and/or ${displayTime}`,
                  officer.name
                ]);
              });
              
              // Show remaining slots if any
              const remainingSlots = slot.afternoonSlot.maxOfficers - slot.afternoonSlot.officers.length;
              for (let i = 0; i < remainingSlots; i++) {
                tableData.push([
                  '',
                  `and/or ${slot.afternoonSlot.time.slice(0, 4)}-${slot.afternoonSlot.time.slice(4)}`,
                  'Available'
                ]);
              }
            } else {
              // No officers, show available slots
              for (let i = 0; i < slot.afternoonSlot.maxOfficers; i++) {
                tableData.push([
                  '',
                  `and/or ${slot.afternoonSlot.time.slice(0, 4)}-${slot.afternoonSlot.time.slice(4)}`,
                  'Available'
                ]);
              }
            }
          });

          // Add a line separator
          doc.setLineWidth(0.5);
          doc.line(20, 55, pageWidth - 20, 55);
          
          // Add table with more compact settings
          autoTable(doc, {
            head: [['DATE', 'TIME', 'OFFICER ASSIGNMENT']],
            body: tableData,
            startY: 60,
            margin: { left: 15, right: 15 },
            styles: {
              fontSize: 7,
              cellPadding: 1.5,
              minCellHeight: 6,
              lineWidth: 0.1,
              lineColor: [200, 200, 200],
              font: 'helvetica',
            },
            headStyles: {
              fillColor: [25, 35, 120], // Professional navy blue
              textColor: 255,
              fontStyle: 'bold',
              fontSize: 8,
              halign: 'center',
              minCellHeight: 8,
              cellPadding: 2,
            },
            columnStyles: {
              0: { cellWidth: 45, halign: 'left', fontStyle: 'bold' }, // Date column
              1: { cellWidth: 35, halign: 'center' }, // Time column  
              2: { cellWidth: 'auto', halign: 'left' }, // Officer column
            },
            alternateRowStyles: {
              fillColor: [248, 249, 250],
            },
            tableLineColor: [180, 180, 180],
            tableLineWidth: 0.15,
            rowPageBreak: 'avoid',
          });
          
        doc.save(`metro-schedule-${monthNames[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
        toast.dismiss(toastId);
        toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.dismiss(toastId);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const formatDate = (date: Date) => {
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
  };

  const getMyShifts = () => {
    const myShifts: Array<{ date: string; time: string; dayName: string }> = [];
    const currentOfficerName = getCurrentOfficerFormatted();
    
    schedule.forEach(slot => {
      // Check morning slot
      const morningOfficer = slot.morningSlot.officers.find(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
      if (morningOfficer) {
        myShifts.push({
          date: formatDate(slot.date),
          time: morningOfficer.customHours || slot.morningSlot.time,
          dayName: slot.dayName
        });
      }
      
      // Check afternoon slot
      const afternoonOfficer = slot.afternoonSlot.officers.find(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
      if (afternoonOfficer) {
        myShifts.push({
          date: formatDate(slot.date),
          time: afternoonOfficer.customHours || slot.afternoonSlot.time,
          dayName: slot.dayName
        });
      }
    });
    return myShifts;
  };

  const displayTime = (time: string) => {
    if (time.includes('-') && time.includes(':')) {
      return time; // Already formatted (custom hours)
    }
    return `${time.slice(0, 2)}:${time.slice(2, 4)}-${time.slice(5, 7)}:${time.slice(7)}`;
  };

  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold">
                Metro Sign Up Schedule - {monthNames[selectedMonth]} {selectedYear}
              </CardTitle>
              <CardDescription>
                Sign up for available overtime shifts at Cheverly Metro Station
              </CardDescription>
            </div>
            {user?.role === 'admin' && (
              <Button
                onClick={generatePDF}
                variant="outline"
                className="flex items-center gap-2"
                disabled={loading}
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex gap-2">
              <Label className="self-center">Month:</Label>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Label className="self-center">Year:</Label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-navy-900 text-white">
                  <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Date/Time</th>
                  <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Officer Name</th>
                  <th className="text-center p-2 sm:p-3 font-semibold text-xs sm:text-sm">Action</th>
                </tr>
              </thead>
              <tbody>
                {schedule.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center p-4 sm:p-8 text-xs sm:text-sm text-muted-foreground">
                      No shifts available for this month
                    </td>
                  </tr>
                ) : (
                  schedule.map((slot) => (
                    <React.Fragment key={slot.id}>
                      <tr key={`${slot.id}-morning`} className="border-t hover:bg-muted/50">
                        <td className="p-2 sm:p-3">
                          <div className="font-semibold text-foreground text-2xs sm:text-sm">
                            <div className="sm:hidden">
                              {new Date(slot.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                            </div>
                            <div className="hidden sm:inline">{slot.dayName} {formatDate(slot.date)}</div>
                          </div>
                          <div className="text-2xs sm:text-sm text-muted-foreground">
                            {displayTime(slot.morningSlot.time)}
                          </div>
                        </td>
                        <td className="p-2 sm:p-3">
                          {slot.morningSlot.officers.length > 0 ? (
                            <div className="space-y-1">
                              {slot.morningSlot.officers.map((officer, index) => (
                                <div key={index} className="text-2xs sm:text-sm flex items-center justify-between bg-muted/30 p-1.5 sm:p-2 rounded-sm">
                                  <div className="flex-1">
                                    <span className={`${officer.name === getCurrentOfficerFormatted() || officer.name === user?.name ? 'font-semibold text-primary' : ''} block text-2xs sm:text-sm`}>
                                      {officer.name}
                                    </span>
                                    {officer.customHours && (
                                      <div className="text-2xs sm:text-xs text-muted-foreground">Custom: {officer.customHours}</div>
                                    )}
                                  </div>
                                  {user?.role === 'admin' && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 ml-1 sm:ml-2 flex-shrink-0"
                                          disabled={loading}
                                          title={`Remove ${officer.name}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove Officer from Shift</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to remove <strong>{officer.name}</strong> from this shift on {slot.dayName} {formatDate(slot.date)}?
                                            <br /><br />
                                            This action cannot be undone and will make the slot available for other officers to sign up.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => handleRemoveOfficer(slot.id, 'morning', officer.name)}
                                            disabled={loading}
                                            className="bg-red-600 hover:bg-red-700"
                                          >
                                            Remove Officer
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              ))}
                              {slot.morningSlot.officers.length < slot.morningSlot.maxOfficers && (
                                <div className="text-2xs sm:text-xs text-muted-foreground italic">
                                  {slot.morningSlot.maxOfficers - slot.morningSlot.officers.length} slot(s) available
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-2xs sm:text-sm text-muted-foreground italic">Available ({slot.morningSlot.maxOfficers} slots)</span>
                          )}
                        </td>
                        <td className="p-2 sm:p-3 text-center">
                          {(() => {
                            const userSignedUp = hasUserSignedUpForSlot(slot.date, 'morning');
                            const slotsAvailable = slot.morningSlot.officers.length < slot.morningSlot.maxOfficers;
                            const isAdmin = user?.role === 'admin';
                            
                            if (!slotsAvailable && !userSignedUp) {
                              return <span className="text-xs sm:text-sm text-muted-foreground">Full ({slot.morningSlot.officers.length}/{slot.morningSlot.maxOfficers})</span>;
                            }
                            
                            return (
                              <div className="flex gap-1 sm:gap-2 justify-center">
                                {userSignedUp ? (
                                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                    <Calendar className="h-3 w-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Signed up</span>
                                  </span>
                                ) : slotsAvailable ? (
                                  <HoursDialog
                                    originalTime={slot.morningSlot.time}
                                    onConfirm={(customHours) => handleSignUp(slot.id, 'morning', customHours)}
                                    onCancel={() => {}}
                                  >
                                    <Button size="sm" disabled={loading} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 p-0 sm:p-2" title="Sign up for this shift">
                                      <Plus className="h-4 w-4 sm:mr-1" />
                                      <span className="hidden sm:inline text-xs sm:text-sm">Sign Up</span>
                                    </Button>
                                  </HoursDialog>
                                ) : null}
                                {isAdmin && slotsAvailable && (
                                  <AdminAssignDialog
                                    users={allUsers.filter(u => u.role === 'user')}
                                    originalTime={slot.morningSlot.time}
                                    onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, 'morning', officerName, customHours)}
                                    disabled={loading}
                                  />
                                )}
                              </div>
                            );
                          })()}

                        </td>
                      </tr>
                      <tr key={`${slot.id}-afternoon`} className="border-t bg-muted/30 hover:bg-muted/50">
                        <td className="p-2 sm:p-3">
                          <div className="text-2xs sm:text-sm text-muted-foreground ml-2 sm:ml-4">
                            <span className="sm:hidden">or</span>
                            <span className="hidden sm:inline">and/or</span> {displayTime(slot.afternoonSlot.time)}
                          </div>
                        </td>
                        <td className="p-2 sm:p-3">
                          {slot.afternoonSlot.officers.length > 0 ? (
                            <div className="space-y-1">
                              {slot.afternoonSlot.officers.map((officer, index) => (
                                <div key={index} className="text-2xs sm:text-sm flex items-center justify-between bg-muted/30 p-1.5 sm:p-2 rounded-sm">
                                  <div className="flex-1">
                                    <span className={`${officer.name === getCurrentOfficerFormatted() || officer.name === user?.name ? 'font-semibold text-primary' : ''} block text-2xs sm:text-sm`}>
                                      {officer.name}
                                    </span>
                                    {officer.customHours && (
                                      <div className="text-2xs sm:text-xs text-muted-foreground">Custom: {officer.customHours}</div>
                                    )}
                                  </div>
                                  {user?.role === 'admin' && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 ml-1 sm:ml-2 flex-shrink-0"
                                          disabled={loading}
                                          title={`Remove ${officer.name}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove Officer from Shift</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to remove <strong>{officer.name}</strong> from this afternoon shift on {slot.dayName} {formatDate(slot.date)}?
                                            <br /><br />
                                            This action cannot be undone and will make the slot available for other officers to sign up.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => handleRemoveOfficer(slot.id, 'afternoon', officer.name)}
                                            disabled={loading}
                                            className="bg-red-600 hover:bg-red-700"
                                          >
                                            Remove Officer
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              ))}
                              {slot.afternoonSlot.officers.length < slot.afternoonSlot.maxOfficers && (
                                <div className="text-2xs sm:text-xs text-muted-foreground italic">
                                  {slot.afternoonSlot.maxOfficers - slot.afternoonSlot.officers.length} slot(s) available
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-2xs sm:text-sm text-muted-foreground italic">Available ({slot.afternoonSlot.maxOfficers} slots)</span>
                          )}
                        </td>
                        <td className="p-2 sm:p-3 text-center">
                          {(() => {
                            const userSignedUp = hasUserSignedUpForSlot(slot.date, 'afternoon');
                            const slotsAvailable = slot.afternoonSlot.officers.length < slot.afternoonSlot.maxOfficers;
                            const isAdmin = user?.role === 'admin';
                            
                            if (!slotsAvailable && !userSignedUp) {
                              return <span className="text-xs sm:text-sm text-muted-foreground">Full ({slot.afternoonSlot.officers.length}/{slot.afternoonSlot.maxOfficers})</span>;
                            }
                            
                            return (
                              <div className="flex gap-1 sm:gap-2 justify-center">
                                {userSignedUp ? (
                                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                    <Calendar className="h-3 w-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Signed up</span>
                                  </span>
                                ) : slotsAvailable ? (
                                  <HoursDialog
                                    originalTime={slot.afternoonSlot.time}
                                    onConfirm={(customHours) => handleSignUp(slot.id, 'afternoon', customHours)}
                                    onCancel={() => {}}
                                  >
                                    <Button size="sm" disabled={loading} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 p-0 sm:p-2" title="Sign up for this shift">
                                      <Plus className="h-4 w-4 sm:mr-1" />
                                      <span className="hidden sm:inline text-xs sm:text-sm">Sign Up</span>
                                    </Button>
                                  </HoursDialog>
                                ) : null}
                                {isAdmin && slotsAvailable && (
                                  <AdminAssignDialog
                                    users={allUsers.filter(u => u.role === 'user')}
                                    originalTime={slot.afternoonSlot.time}
                                    onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, 'afternoon', officerName, customHours)}
                                    disabled={loading}
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Scheduled Shifts</CardTitle>
          <CardDescription>Your upcoming overtime assignments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getMyShifts().length > 0 ? (
              getMyShifts().map((shift, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded-lg bg-muted/30">
                  <div>
                    <div className="font-semibold">
                      {shift.dayName}, {shift.date}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Time: {shift.time.includes(':') ? shift.time : displayTime(shift.time)}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">
                    Confirmed
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No shifts scheduled</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}