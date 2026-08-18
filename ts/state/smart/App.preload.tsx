// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import { memo, useCallback, useEffect, useState, type JSX } from 'react';
import { useSelector } from 'react-redux';
import { App } from '../../components/App.dom.tsx';
import OS from '../../util/os/osMain.node.ts';
import { SmartCallManager } from './CallManager.preload.tsx';
import { SmartGlobalModalContainer } from './GlobalModalContainer.preload.tsx';
import { SmartLightbox } from './Lightbox.preload.tsx';
import { SmartStoryViewer } from './StoryViewer.preload.tsx';
import {
  getIsMainWindowMaximized,
  getIsMainWindowFullScreen,
  getTheme,
  getIntl,
} from '../selectors/user.std.ts';
import { hasSelectedStoryData as getHasSelectedStoryData } from '../selectors/stories.preload.ts';
import { useConversationsActions } from '../ducks/conversations.preload.ts';
import { useStoriesActions } from '../ducks/stories.preload.ts';
import { ErrorBoundary } from '../../components/ErrorBoundary.dom.tsx';
import { ModalContainer } from '../../components/ModalContainer.dom.tsx';
import { SmartInbox } from './Inbox.preload.tsx';
import { SmartInstallScreen } from './InstallScreen.preload.tsx';
import { getApp } from '../selectors/app.std.ts';
import { SmartFunProvider } from './FunProvider.preload.tsx';
import { SmartStandaloneRegistration } from './StandaloneRegistration.preload.tsx';
import { InstallScreenAccountSwitcher } from '../../components/installScreen/InstallScreenAccountSwitcher.dom.tsx';
import type { AccountProfilesSnapshot } from '../../types/AccountProfile.std.ts';
import { drop } from '../../util/drop.std.ts';
import { AppViewType } from '../../types/app.std.ts';

function renderInbox(): JSX.Element {
  return <SmartInbox />;
}

function renderCallManager(): JSX.Element {
  return (
    <ModalContainer className="module-calling__modal-container">
      <SmartCallManager />
    </ModalContainer>
  );
}

function renderGlobalModalContainer(): JSX.Element {
  return <SmartGlobalModalContainer />;
}

function renderInstallScreen(): JSX.Element {
  return <SmartInstallScreen />;
}

function renderLightbox(): JSX.Element {
  return <SmartLightbox />;
}

function renderStandaloneRegistration(): JSX.Element {
  return (
    <ErrorBoundary name="App/renderStandaloneRegistration">
      <SmartStandaloneRegistration />
    </ErrorBoundary>
  );
}

function renderStoryViewer(closeView: () => unknown): JSX.Element {
  return (
    <ErrorBoundary name="App/renderStoryViewer" closeView={closeView}>
      <SmartStoryViewer />
    </ErrorBoundary>
  );
}

export const SmartApp = memo(function SmartApp() {
  const state = useSelector(getApp);
  const isMaximized = useSelector(getIsMainWindowMaximized);
  const isFullScreen = useSelector(getIsMainWindowFullScreen);
  const hasSelectedStoryData = useSelector(getHasSelectedStoryData);
  const theme = useSelector(getTheme);
  const i18n = useSelector(getIntl);
  const [accountProfiles, setAccountProfiles] =
    useState<AccountProfilesSnapshot>();

  useEffect(() => {
    if (
      state.appView !== AppViewType.Installer &&
      state.appView !== AppViewType.Standalone
    ) {
      return;
    }

    async function loadAccountProfiles(): Promise<void> {
      setAccountProfiles(await window.SignalContext.accountProfiles.list());
    }

    drop(loadAccountProfiles());
  }, [state.appView]);

  const switchAccountProfile = useCallback(
    async (profileId: string): Promise<void> => {
      await window.SignalContext.accountProfiles.switch(profileId);
    },
    []
  );

  const { scrollToMessage } = useConversationsActions();
  const { viewStory } = useStoriesActions();

  const osClassName = OS.getClassName();

  return (
    <SmartFunProvider>
      <App
        state={state}
        isMaximized={isMaximized}
        isFullScreen={isFullScreen}
        osClassName={osClassName}
        renderCallManager={renderCallManager}
        renderGlobalModalContainer={renderGlobalModalContainer}
        renderInstallScreen={renderInstallScreen}
        renderInstallAccountSwitcher={() => (
          <InstallScreenAccountSwitcher
            accountProfiles={accountProfiles?.profiles}
            i18n={i18n}
            switchAccountProfile={switchAccountProfile}
          />
        )}
        renderLightbox={renderLightbox}
        renderStandaloneRegistration={renderStandaloneRegistration}
        hasSelectedStoryData={hasSelectedStoryData}
        renderStoryViewer={renderStoryViewer}
        renderInbox={renderInbox}
        theme={theme}
        scrollToMessage={scrollToMessage}
        viewStory={viewStory}
      />
    </SmartFunProvider>
  );
});
