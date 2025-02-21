import { Choice, Condition } from 'aws-cdk-lib/aws-stepfunctions';

export class JsonAtaChoice extends Choice {
  public toStateJson(): object {
    return {
      ...super.toStateJson(),
      QueryLanguage: 'JSONata',
    };
  }
}

export class JsonAtaCondition extends Condition {
  constructor(private readonly expression: string) {
    super();
  }

  public static condition(expression: string): Condition {
    return new JsonAtaCondition(expression);
  }

  public renderCondition() {
    return {
      Condition: `{% ${this.expression} %}`,
    };
  }
}
