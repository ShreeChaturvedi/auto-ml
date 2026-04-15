import React, { useEffect, useState } from "react";
import { cancelRender, useDelayRender } from "remotion";
import { waitForFonts } from "../../config/fonts";

/**
 * Mounts children only once all fonts are loaded. Missing fonts can shift
 * layout calculations (measured text widths), so scenes that do
 * DOM-measuring must wait.
 */
export const WaitForFonts: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() =>
    delayRender("Waiting for fonts to be loaded"),
  );

  useEffect(() => {
    let cancelled = false;
    waitForFonts()
      .then(() => {
        if (cancelled) return;
        setFontsLoaded(true);
        continueRender(handle);
      })
      .catch((err) => {
        if (!cancelled) cancelRender(err);
      });
    return () => {
      cancelled = true;
    };
    // handle, continueRender, delayRender are stable references from Remotion;
    // excluding avoids unnecessary re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fontsLoaded) return null;
  return <>{children}</>;
};
