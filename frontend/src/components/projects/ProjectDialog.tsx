/**
 * ProjectDialog - Create/Edit project dialog
 *
 * Features:
 * - Form with React Hook Form + Zod validation
 * - Title input
 * - Icon selector (from lucide-react)
 * - Color picker (predefined palette)
 * - Description textarea
 * - Handles both create and edit modes
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/stores/projectStore';
import type { Project, ProjectColor } from '@/types/project';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

// Form validation schema
const projectFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title must be less than 50 characters'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  icon: z.string().min(1, 'Icon is required'),
  color: z.enum([
    'blue',
    'green',
    'purple',
    'pink',
    'orange',
    'red',
    'yellow',
    'indigo',
    'teal',
    'cyan'
  ])
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

// Popular icons for projects
const projectIcons = [
  'Folder',
  'FolderOpen',
  'Database',
  'Brain',
  'Sparkles',
  'Zap',
  'Rocket',
  'Target',
  'BarChart',
  'LineChart',
  'Box',
  'Cpu'
];

// Color options
const colorOptions: ProjectColor[] = [
  'blue',
  'green',
  'purple',
  'pink',
  'orange',
  'red',
  'yellow',
  'indigo',
  'teal',
  'cyan'
];

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project; // If provided, edit mode; otherwise, create mode
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();

  const isEditMode = !!project;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: project?.title || '',
      description: project?.description || '',
      icon: project?.icon || 'Folder',
      color: project?.color || 'blue'
    }
  });

  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (open) {
      reset({
        title: project?.title || '',
        description: project?.description || '',
        icon: project?.icon || 'Folder',
        color: project?.color || 'blue'
      });
      setFormError(null);
      setIsIconPickerOpen(false);
    }
  }, [open, project, reset]);

  const selectedIcon = watch('icon');
  const selectedColor = watch('color');

  const onSubmit = async (data: ProjectFormValues) => {
    setFormError(null);

    try {
      if (isEditMode && project) {
        await updateProject(project.id, data);
      } else {
        const created = await createProject(data);
        // Immediately activate and navigate to the new project's upload phase
        setActiveProject(created.id);
        navigate(`/project/${created.id}/upload`);
      }
      onOpenChange(false);
    } catch {
      setFormError('Unable to save project. Please try again.');
    }
  };

  // Get preview icon component
  const PreviewIconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    selectedIcon
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Project' : 'Create New Project'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your project details.'
              : 'Create a new project to organize your AutoML workflows.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title and Icon Preview Row */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-3">
              {/* Icon Preview (Clickable) */}
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all hover:scale-105 focus:outline-none',
                  projectColorClasses[selectedColor].bg,
                  projectColorClasses[selectedColor].text,
                  projectColorClasses[selectedColor].border
                )}
                title="Click to change icon"
              >
                {PreviewIconComponent && <PreviewIconComponent className="h-5 w-5" />}
              </button>

              {/* Title Field */}
              <div className="flex-1">
                <Input id="title" placeholder="My ML Project" {...register('title')} />
              </div>
            </div>
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              rows={3}
              className="w-full"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {formError && (
            <p className="text-xs text-destructive">{formError}</p>
          )}

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((color) => {
                const colorClass = {
                  blue: 'bg-blue-500',
                  green: 'bg-green-500',
                  purple: 'bg-purple-500',
                  pink: 'bg-pink-500',
                  orange: 'bg-orange-500',
                  red: 'bg-red-500',
                  yellow: 'bg-yellow-500',
                  indigo: 'bg-indigo-500',
                  teal: 'bg-teal-500',
                  cyan: 'bg-cyan-500'
                }[color];

                return (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'h-8 w-8 rounded-md border-2 transition-all',
                      colorClass,
                      selectedColor === color
                        ? 'border-foreground scale-110'
                        : 'border-border hover:border-foreground hover:scale-105'
                    )}
                    onClick={() => setValue('color', color)}
                    title={color}
                    aria-label={`Select ${color} color`}
                  />
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEditMode ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Icon Picker Dialog */}
      <Dialog open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose an Icon</DialogTitle>
            <DialogDescription>
              Select an icon for your project
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 py-4">
            {projectIcons.map((iconName) => {
              const IconComponent = (LucideIcons as unknown as Record<
                string,
                React.ComponentType<{ className?: string }>
              >)[iconName];
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => {
                    setValue('icon', iconName);
                    setIsIconPickerOpen(false);
                  }}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-md border-2 transition-all hover:scale-105',
                    selectedIcon === iconName
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  )}
                  title={iconName}
                >
                  {IconComponent && <IconComponent className="h-5 w-5" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
