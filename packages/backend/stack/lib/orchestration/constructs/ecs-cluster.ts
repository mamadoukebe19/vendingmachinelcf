import { StackProps } from "aws-cdk-lib";
import { SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

interface EcsClusterProps extends StackProps {}

export class EcsClusterConstruct extends Construct {
  cluster: Cluster;
  securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: EcsClusterProps) {
    super(scope, id);

    const vpc = new Vpc(this, "Vpc", {
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });

    this.cluster = new Cluster(this, "Cluster", { vpc: vpc });
  }
}
