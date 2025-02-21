import { CustomState } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

interface DynamoUnmarshallProps {
  path: string;
  variableName?: string;
}

const generateUnmarshall = (path: string) => `{% (
  $unmarshall := function ($object) {(
    $not($exists($object)) or $object = null ? null :
    $type($object) = 'array' ?
      [$map($object, $unmarshall)]
      : $type($object) = 'object' ?
        $merge($each($object, function ($val, $key) {
              { $key: $convertValue($val) }
          })
        )
      : $object;
  )};

  $convertValue := function ($object) {(
    $type := $keys($object)[0];
    $value := $lookup($object, $type);
  
    $type in ['S', 'SS', 'Ss', 'B', 'BS', 'Bs'] ?  $value
      : $type in ['N'] ? $number($value)
      : $type in ['M'] ? $unmarshall($value)
      : $type in ['BOOL', 'Bool'] ? $value = 'true' or $value = true
      : $type in ['L'] ? [$map($value, $convertValue)]
      : $type in ['NS', 'Ns'] ? [$value.$number()]
      : $type in ['NULL', 'Null', 'Nul'] ? null
      : $error('Unsupported type: ' & $type);
  )};
 
  $unmarshall(${path});
) %}`;

export class DynamoUnmarshall extends CustomState {
  constructor(scope: Construct, id: string, props: DynamoUnmarshallProps) {
    const { path, variableName } = props;

    super(scope, id, {
      stateJson: {
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Assign: {
          ...(variableName ? { [variableName]: generateUnmarshall(path) } : {}),
        },
        Output: !variableName ? generateUnmarshall(path) : undefined,
      },
    });
  }
}
