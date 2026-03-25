import { useAnimatedValue } from '@/hooks/useAnimatedValue';

export function AnimatedNum({ value, format }: { value: number; format: (n: number) => string }) {
  const animated = useAnimatedValue(value);
  return <>{format(animated)}</>;
}
