'use client';

import { useState, useEffect } from 'react';

interface User {
  name: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome, {user?.name}
        </h2>
        <p className="text-gray-600">
          Welcome to the Cheverly Police Department Metro Schedule Management System.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Available Shifts
          </h3>
          <p className="text-3xl font-bold text-blue-600">12</p>
          <p className="text-sm text-gray-500 mt-2">This month</p>
        </div>


        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Upcoming Shift
          </h3>
          <p className="text-lg font-bold text-gray-900">Tomorrow</p>
          <p className="text-sm text-gray-500 mt-1">8:00 AM - 4:00 PM</p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="space-y-2">
          <a
            href="/dashboard/schedule"
            className="block w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            <span className="font-medium text-blue-700">View Schedule</span>
            <span className="block text-sm text-blue-600 mt-1">
              Check available overtime opportunities
            </span>
          </a>
          <a
            href="/dashboard/profile"
            className="block w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
          >
            <span className="font-medium text-gray-700">Update Profile</span>
            <span className="block text-sm text-gray-600 mt-1">
              Manage your account settings
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}