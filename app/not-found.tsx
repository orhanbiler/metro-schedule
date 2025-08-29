export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
        <p className="text-muted-foreground mb-4">Page not found</p>
        <a 
          href="/dashboard" 
          className="text-primary hover:underline"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}