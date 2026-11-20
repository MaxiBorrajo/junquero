import { Redirect } from "expo-router";
import { setViewMode } from "../../session/viewMode";

// La pantalla única de jurado se separó en pestañas (vista de jurado). Los enlaces viejos a /jury entran por acá.
export default function JuryEntry() {
  setViewMode("jury");
  return <Redirect href="/jury-open" />;
}
