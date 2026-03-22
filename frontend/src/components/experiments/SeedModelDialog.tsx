import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import * as modelApi from '@/lib/api/models';
import { useModelStore } from '@/stores/modelStore';

type TaskType = 'classification' | 'regression' | 'clustering';

const ALGORITHMS: Record<TaskType, string[]> = {
  classification: ['Random Forest', 'Logistic Regression', 'KNN', 'Gradient Boosting', 'SVM', 'Decision Tree'],
  regression: ['Linear Regression', 'Random Forest Regressor', 'Gradient Boosting Regressor', 'SVR', 'Ridge'],
  clustering: ['K-Means', 'DBSCAN', 'Agglomerative'],
};

interface SeedModelDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedModelDialog({ projectId, open, onOpenChange }: SeedModelDialogProps) {
  const models = useModelStore((s) => s.models);
  const [taskType, setTaskType] = useState<TaskType>('classification');
  const [algorithm, setAlgorithm] = useState(ALGORITHMS.classification[0]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const defaultName = `Model ${models.length + 1}`;
      setName(defaultName);
      setTaskType('classification');
      setAlgorithm(ALGORITHMS.classification[0]);
    }
  }, [open, models.length]);

  const handleTaskTypeChange = useCallback((value: string) => {
    const tt = value as TaskType;
    setTaskType(tt);
    setAlgorithm(ALGORITHMS[tt][0]);
  }, []);

  const refresh = useCallback(() => {
    useModelStore.getState().refreshModels(projectId);
  }, [projectId]);

  const handleAddModel = useCallback(async () => {
    setLoading(true);
    try {
      await modelApi.seedOneModel(projectId, { name, taskType, algorithm });
      refresh();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, name, taskType, algorithm, refresh, onOpenChange]);

  const handleSeedBulk = useCallback(async () => {
    setLoading(true);
    try {
      await modelApi.seedModels(projectId);
      refresh();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, refresh, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Seed Test Model</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="seed-name">Name</Label>
            <Input
              id="seed-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Model name"
            />
          </div>

          <div className="grid gap-2">
            <Label>Task Type</Label>
            <Select value={taskType} onValueChange={handleTaskTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="regression">Regression</SelectItem>
                <SelectItem value="clustering">Clustering</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Algorithm</Label>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGORITHMS[taskType].map((alg) => (
                  <SelectItem key={alg} value={alg}>{alg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <Button variant="outline" onClick={handleSeedBulk} disabled={loading}>
            Seed 5 sample models
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={handleAddModel} disabled={loading || !name.trim()}>
            Add Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
