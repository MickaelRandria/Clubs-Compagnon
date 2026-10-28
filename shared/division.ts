/** EA numérote les divisions Pro Clubs depuis l'Élite : 1 = Élite, 2 = Division 1, 3 = Division 2… */
export function divisionLabel(eaDivision: number): string {
  return eaDivision <= 1 ? 'Élite' : `Division ${eaDivision - 1}`;
}
