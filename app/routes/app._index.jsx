import {Form, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}) {
  const {session} = await authenticate.admin(request);

  let settings = await prisma.cartFeeSettings.findUnique({
    where: {
      shop: session.shop,
    },
  });

  if (!settings) {
    settings = await prisma.cartFeeSettings.create({
      data: {
        shop: session.shop,
      },
    });
  }

  return {
    settings: {
      enabled: settings.enabled,
      title: settings.title,
      value: settings.value.toString(),
    },
  };
}

export async function action({request}) {
  const {session} = await authenticate.admin(request);

  const formData = await request.formData();

  const enabled = formData.get("enabled") === "on";
  const title = String(formData.get("title") || "Handling fee");
  const type = String(formData.get("type"));
  const value = Number(formData.get("value") || 0);

  await prisma.cartFeeSettings.upsert({
    where: {
      shop: session.shop,
    },
    update: {
      enabled,
      title,
      type,
      value,
    },
    create: {
      shop: session.shop,
      enabled,
      title,
      type,
      value,
    },
  });

  return {
    success: true,
  };
}

export default function Index() {
  const {settings} = useLoaderData();

  return (
    <s-page heading="Cart Fee">
      <Form method="post">
        <s-section heading="Fee settings">
          <s-checkbox
            name="enabled"
            label="Enable cart fee"
            checked={settings.enabled}
          />

          <s-text-field
            name="title"
            label="Fee title"
            value={settings.title}
          />
          <s-select
            name="type"
            label="Fee type"
            value={settings.type}
          >
            <s-option value="percentage">Percentage</s-option>
            <s-option value="fixed">Fixed amount</s-option>
          </s-select>

          <s-number-field
            name="value"
            label="Fee value"
            value={settings.value}
            min="0"
            step="0.01"
          />

          <s-button type="submit" variant="primary">
            Save settings
          </s-button>
        </s-section>
      </Form>
    </s-page>
  );
}