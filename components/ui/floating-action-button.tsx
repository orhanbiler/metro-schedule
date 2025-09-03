'use client';

import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

interface FloatingActionButtonProps extends ButtonProps {
  icon?: React.ReactNode;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  offset?: {
    bottom?: number;
    right?: number;
    left?: number;
  };
}

const FloatingActionButton = forwardRef<HTMLButtonElement, FloatingActionButtonProps>(
  ({ 
    className, 
    icon = <Plus className="h-6 w-6" />, 
    position = 'bottom-right',
    offset = { bottom: 20, right: 20, left: 20 },
    size = 'default',
    ...props 
  }, ref) => {
    const positionClasses = {
      'bottom-right': 'bottom-0 right-0',
      'bottom-left': 'bottom-0 left-0',
      'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2',
    };
    
    const offsetStyle = {
      bottom: `${offset.bottom}px`,
      ...(position === 'bottom-right' && { right: `${offset.right}px` }),
      ...(position === 'bottom-left' && { left: `${offset.left}px` }),
    };
    
    return (
      <Button
        ref={ref}
        size={size}
        className={cn(
          'fixed z-50 shadow-lg hover:shadow-xl transition-all duration-200',
          'rounded-full',
          'h-14 w-14 p-0', // Fixed size for FAB
          positionClasses[position],
          className
        )}
        style={offsetStyle}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

FloatingActionButton.displayName = 'FloatingActionButton';

export { FloatingActionButton };