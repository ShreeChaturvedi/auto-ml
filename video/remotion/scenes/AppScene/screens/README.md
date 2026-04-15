# AppScene screens

Each file exports a React component that matches `AppScreenComponent`:

  const HomeScreen: AppScreenComponent = ({ scene, meta }) => { ... }

Screens register themselves in `../screenRegistry.ts`.

Beat 1 adds: `LandingScreen`.
Beat 2 adds: `LoginScreen`, `SignupScreen`, `HomeScreen`.
Beats 3+ add: `UploadScreen`, `EdaScreen`, `PreprocessScreen`, `FeaturesScreen`, `TrainScreen`, `ExperimentsScreen`.
