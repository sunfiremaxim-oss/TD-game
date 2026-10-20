/** Pure DTO: reactive defense stats and the bounded lifesteal healing budget. */
export class DefenseComponent {
  constructor() {
    this.damageReflection = 0;
    this.lifeSteal = 0;
    this.lifeStealBudget = 0;
    this.knockbackChance = 0;
    this.knockbackPower = 30;
  }
}
