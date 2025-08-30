# Metro Schedule Management System

A modern, real-time schedule management application built for the Cheverly Police Department's metro overtime scheduling system.

## 🚀 Features

### Core Functionality
- **Real-time Schedule Updates** - Changes appear instantly across all users using Firestore listeners
- **Dual Officer Support** - Up to 2 officers can sign up for each shift slot
- **Custom Hours** - Officers can set personalized working hours when signing up
- **Role-based Access Control** - Admin and user roles with different permissions
- **Mobile-Optimized** - Responsive design that works perfectly on all devices

### User Features
- **Easy Sign-up** - One-click shift registration with custom hour options
- **Personal Dashboard** - View your upcoming shifts and schedule summary
- **Profile Management** - Complete user profile with rank, ID number, and activity tracking
- **Real-time Updates** - See changes made by other officers immediately

### Admin Features
- **User Management** - Complete admin dashboard with user statistics and management
- **Schedule Control** - Assign officers to shifts, clear shifts, and manage the entire schedule
- **PDF Export** - Generate and download professional PDF schedules with Cheverly PD logo
- **Analytics Dashboard** - View schedule coverage, available slots, and active officers
- **Confirmation Dialogs** - Safety confirmations for critical operations like removing officers

### UI/UX Improvements
- **Modern Toast Notifications** - Professional feedback using Sonner toast system
- **Confirmation Dialogs** - AlertDialog confirmations for destructive actions
- **Mobile-Optimized Navigation** - Responsive top navigation with logo integration
- **Professional PDF Generation** - Branded PDFs with department logo and clean formatting

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS, ShadCN/UI Components (Alert Dialog, Sonner Toasts)
- **Backend**: Next.js API Routes
- **Database**: Firebase Firestore with real-time listeners
- **Authentication**: Firebase Authentication
- **PDF Generation**: jsPDF with autotable
- **Icons**: Lucide React

## 🏗 Architecture

### Data Structure
- **Users**: Rank-based officers with ID numbers and custom profiles
- **Schedules**: Monthly schedules with morning/afternoon slots
- **Real-time Sync**: Firestore listeners for instant updates across all clients

### Security Features
- **Role-based permissions**: Users can only sign up; admins can manage
- **Authentication required**: All routes protected with user verification
- **Input validation**: Client and server-side validation for all forms

## 📱 User Interface

### Schedule Display Format
```
Date/Time           Officer Name              Action
Friday 08/01/25     
05:00-13:00         Sgt. Smith #1234          [Actions]
                    Officer Johnson #5678     [Actions]
                    1 slot(s) available

and/or 13:00-19:00  Available (2 slots)       [Sign Up]
```

### User Display Format
Officers are displayed as: `[Rank] [LastName] #[IDNumber]`
- Example: "Sgt. Smith #1234"
- Example: "Officer Johnson #5678"

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Firestore and Authentication enabled
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/orhanbiler/metro-schedule.git
   cd metro-schedule
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Environment Setup**
   Create `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

4. **Firebase Configuration**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Add your domain to authorized domains

5. **Run the development server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📊 Database Structure

### Users Collection (`users`)
```javascript
{
  id: "user_id",
  email: "officer@cheverlypd.gov",
  name: "Smith", // Last name only
  idNumber: "1234",
  rank: "Sgt.", // Trainee, Officer, PFC., Cpl., Sgt., Lt., Capt., Asst. Chief, Chief
  role: "user", // "user" or "admin"
  firebaseAuthUID: "firebase_uid",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Schedules Collection (`schedules`)
```javascript
{
  id: "2024-7", // year-month format
  month: 7,
  year: 2024,
  schedule: [
    {
      id: "2024-7-1",
      date: "2024-08-01T00:00:00.000Z",
      dayName: "Friday",
      morningSlot: {
        time: "0500-1300",
        available: false,
        officers: [
          {
            name: "Sgt. Smith #1234",
            customHours: "07:00-11:00" // optional
          },
          {
            name: "Officer Johnson #5678"
          }
        ],
        maxOfficers: 2
      },
      afternoonSlot: {
        time: "1300-1900",
        available: true,
        officers: [],
        maxOfficers: 2
      }
    }
  ],
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

## 🔐 Authentication Flow

1. **Sign Up**: New officers create accounts with rank and ID number
2. **Profile Creation**: Firebase Auth user + Firestore profile document
3. **Role Assignment**: Default "user" role, admins manually set to "admin"
4. **Session Management**: Firebase handles authentication state

## 🌟 Key Features Explained

### Real-time Updates
- Uses Firestore `onSnapshot` listeners
- Changes propagate instantly to all connected clients
- No polling or manual refresh required

### Dual Officer Slots
- Each shift slot supports exactly 2 officers
- Independent custom hours for each officer
- Smart availability tracking (available when < 2 officers)

### Role-based Permissions
- **Users**: Sign up for available shifts, view own schedule
- **Admins**: All user permissions + assign others, clear shifts, export PDFs

### Data Migration
- Automatic migration from single-officer to dual-officer format
- Backward compatibility with existing schedule data
- Seamless upgrade path for deployed systems

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

### Project Structure
```
metro-schedule-app/
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── dashboard/      # Protected dashboard pages
│   ├── login/          # Authentication pages
│   └── signup/
├── components/         # React components
│   ├── ui/            # ShadCN UI components
│   └── schedule/      # Schedule-specific components
├── lib/               # Utility functions
│   └── firebase.ts    # Firebase configuration
└── public/            # Static assets
```

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on git push

### Other Platforms
- **Netlify**: Works with Next.js
- **Firebase Hosting**: Can be configured for Next.js
- **Self-hosted**: Use `npm run build && npm run start`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆕 Recent Updates (Latest Version)

### Security & User Experience Improvements
- ✅ **Comprehensive Security Review** - Identified and documented critical security vulnerabilities
- ✅ **Modern Toast Notifications** - Replaced inline messages with professional Sonner toast system
- ✅ **Confirmation Dialogs** - Added AlertDialog confirmations for critical operations (removing officers)
- ✅ **Enhanced Error Handling** - Comprehensive edge case coverage and validation
- ✅ **Mobile Navigation Optimization** - Fixed overflow issues and improved responsive design
- ✅ **Logo Integration** - Added Cheverly Police Department logo to navigation and PDF exports
- ✅ **Profile Page Updates** - Improved labeling and user information display
- ✅ **Dashboard Cleanup** - Streamlined interface by removing placeholder scheduled hours section

### PDF Generation Enhancements
- Professional layout with department logo
- Compact table design with uppercase headers
- Enhanced typography and spacing
- Loading indicators with dismissible progress toasts

### Navigation Improvements
- Mobile-first responsive design
- Logo integration in top navigation
- Improved spacing and button sizing
- Better user information display with rank and ID number
- Profile link added to navigation menu

## 🏛 About

Built specifically for the Cheverly Police Department's metro overtime scheduling needs. This application streamlines the process of managing officer assignments for metro shifts while ensuring real-time coordination and proper documentation.

## 🆘 Support

For issues, questions, or feature requests:
- Create an issue in the [GitHub repository](https://github.com/orhanbiler/metro-schedule/issues)
- Contact the development team

---

**Metro Schedule Management System** - Streamlining law enforcement scheduling with modern technology.
