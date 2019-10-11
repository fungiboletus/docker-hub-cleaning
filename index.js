const docker = require('docker-hub-api');
const semver = require('semver');
const inquirer = require('inquirer');

docker.setCacheOptions({ enabled: false });

(async () => {

  let username = process.env.DOCKER_HUB_USERNAME;
  let password = process.env.DOCKER_HUB_PASSWORD;

  if (!username) {
    const answer = await inquirer.prompt({ type: 'input', name: 'username', message: 'Docker hub username' });
    username = answer.username;
  }
  if (!password) {
    const answer = await inquirer.prompt({ type: 'password', name: 'password', message: 'Docker hub password' });
    password = answer.password;
  }

  await docker.login(username, password);

  while (true) {
    const answer = await inquirer.prompt(({ type: 'input', name: 'image', message: 'Image' }));
    image = answer.image;
    if (!image) {
      break;
    }

    let [imageUsername, imageName] = image.split('/');
    if (!imageName) {
      imageUsername = username;
      imageName = image;
    }

    // Load all tags
    let tags = [];
    let page = 1;
    let shouldContinue = false;
    do {
      console.log(`Loading page ${page}`);
      const newTags = await docker.tags(imageUsername, imageName, {
        page,
        perPage: 25,
      });
      shouldContinue = newTags.length > 0;
      tags = tags.concat(newTags);
      page += 1;
    } while (shouldContinue);

    if (tags.length === 0) {
      console.log("No tags to delete. Done for this image.");
      continue;
    }

    const { keepChoices } = await inquirer.prompt({
      type: 'checkbox',
      message: 'Keep tags with',
      name: 'keepChoices',
      choices: [
        { name: 'Valid Semver (eg. 2.3.0)', value: 'semver', checked: true },
        { name: 'Short invalid Semver (eg. 2 or 2.3)', value: 'shortsemver', checked: true },
        { name: 'Latest (eg. branch-latest)', value: 'latest', checked: true },
      ],
    });

    const keep = keepChoices.reduce((obj, name) => (obj[name] = true, obj), {});

    const tagsToRemove = tags.filter(({ name }) =>
      !((!name)
        || (keep.semver && semver.valid(name))
        || (keep.shortsemver && /^\d+(\.\d+|)$/.test(name))
        || (keep.latest && name.includes('latest'))));

    if (tagsToRemove.length === 0) {
      console.log("No tags to delete. Done for this image.");
      continue;
    }

    const { tagsConfirmedToRemove, confirmed } = await inquirer.prompt([{
      type: 'checkbox',
      message: 'Remove tags',
      name: 'tagsConfirmedToRemove',
      choices: tagsToRemove.map(({ name }) => ({ name, checked: true })),
    }, {
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure ?',
      default: false,
    }]);
    if (!confirmed) {
      continue;
    }

    console.log("Deleting tags");
    await Promise.all(tagsConfirmedToRemove.map((tag) => docker.deleteTag(imageUsername, imageName, tag)));
    console.log("All tags deleted.");
  }
})();